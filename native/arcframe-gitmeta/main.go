// Package main implements arcframe-gitmeta: structured JSON git metadata for Arcframe.
//
// Why Go: fast, dependency-light parsing of git porcelain/blame/log into a stable
// JSON contract used by @arcframe/engineering (with a TypeScript fallback).
//
// Invocation: run with cwd = project root.
//   arcframe-gitmeta status
//   arcframe-gitmeta blame <path>
//   arcframe-gitmeta log [limit]
package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

const maxBlameLines = 400

type gitStatus struct {
	Available  bool     `json:"available"`
	Branch     *string  `json:"branch"`
	Clean      *bool    `json:"clean"`
	Ahead      *int     `json:"ahead"`
	Behind     *int     `json:"behind"`
	Staged     []string `json:"staged"`
	Unstaged   []string `json:"unstaged"`
	Untracked  []string `json:"untracked"`
	Confidence string   `json:"confidence"`
}

type blameResult struct {
	Path       string   `json:"path"`
	Lines      []string `json:"lines"`
	Confidence string   `json:"confidence"`
}

type logResult struct {
	Entries    []string `json:"entries"`
	Confidence string   `json:"confidence"`
}

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	cmd := os.Args[1]
	rest := os.Args[2:]
	root, err := os.Getwd()
	if err != nil {
		fmt.Fprintf(os.Stderr, "arcframe-gitmeta: %v\n", err)
		os.Exit(1)
	}
	if env := os.Getenv("ARCFRAME_GITMETA_ROOT"); env != "" {
		root = env
	}

	switch cmd {
	case "status":
		err = writeJSON(runStatus(root))
	case "blame":
		path := ""
		if len(rest) > 0 {
			path = rest[0]
		}
		if path == "" {
			fmt.Fprintln(os.Stderr, "arcframe-gitmeta blame: path required")
			os.Exit(2)
		}
		err = writeJSON(runBlame(root, path))
	case "log":
		limit := 10
		if len(rest) > 0 {
			if n, e := strconv.Atoi(rest[0]); e == nil && n > 0 {
				limit = n
			}
		}
		err = writeJSON(runLog(root, limit))
	case "help", "-h", "--help":
		usage()
		return
	default:
		fmt.Fprintf(os.Stderr, "unknown command: %s\n", cmd)
		usage()
		os.Exit(2)
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "arcframe-gitmeta: %v\n", err)
		os.Exit(1)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, `usage (cwd = project root):
  arcframe-gitmeta status
  arcframe-gitmeta blame <path>
  arcframe-gitmeta log [limit]`)
}

func writeJSON(v any) error {
	enc := json.NewEncoder(os.Stdout)
	enc.SetEscapeHTML(false)
	return enc.Encode(v)
}

func gitAvailable() bool {
	_, err := exec.LookPath("git")
	return err == nil
}

func hasGitDir(root string) bool {
	info, err := os.Stat(filepath.Join(root, ".git"))
	return err == nil && (info.IsDir() || info.Mode().IsRegular())
}

func runGit(root string, args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = root
	out, err := cmd.Output()
	return string(out), err
}

func runStatus(root string) gitStatus {
	empty := gitStatus{
		Available:  false,
		Staged:     []string{},
		Unstaged:   []string{},
		Untracked:  []string{},
		Confidence: "unknown",
	}
	if !gitAvailable() {
		return empty
	}
	if !hasGitDir(root) {
		empty.Confidence = "confirmed"
		return empty
	}

	branchOut, err := runGit(root, "rev-parse", "--abbrev-ref", "HEAD")
	branch := strings.TrimSpace(branchOut)
	if err != nil || branch == "" || branch == "HEAD" {
		if sym, e := runGit(root, "symbolic-ref", "--short", "HEAD"); e == nil && strings.TrimSpace(sym) != "" {
			branch = strings.TrimSpace(sym)
		} else if name, e := runGit(root, "branch", "--show-current"); e == nil && strings.TrimSpace(name) != "" {
			branch = strings.TrimSpace(name)
		} else {
			branch = "unborn"
		}
	}

	statusOut, _ := runGit(root, "status", "--porcelain=v1", "-b")
	staged := []string{}
	unstaged := []string{}
	untracked := []string{}
	ahead := 0
	behind := 0

	sc := bufio.NewScanner(strings.NewReader(statusOut))
	for sc.Scan() {
		line := sc.Text()
		if line == "" {
			continue
		}
		if strings.HasPrefix(line, "##") {
			if i := strings.Index(line, "ahead "); i >= 0 {
				ahead = parseTrailingInt(line[i+6:])
			}
			if i := strings.Index(line, "behind "); i >= 0 {
				behind = parseTrailingInt(line[i+7:])
			}
			continue
		}
		if len(line) < 3 {
			continue
		}
		code := line[:2]
		file := line[3:]
		if code == "??" {
			untracked = append(untracked, file)
			continue
		}
		if code[0] != ' ' && code[0] != '?' {
			staged = append(staged, file)
		}
		if code[1] != ' ' && code[1] != '?' {
			unstaged = append(unstaged, file)
		}
	}

	clean := len(staged) == 0 && len(unstaged) == 0 && len(untracked) == 0
	b := branch
	return gitStatus{
		Available:  true,
		Branch:     &b,
		Clean:      &clean,
		Ahead:      &ahead,
		Behind:     &behind,
		Staged:     staged,
		Unstaged:   unstaged,
		Untracked:  untracked,
		Confidence: "confirmed",
	}
}

func parseTrailingInt(s string) int {
	n := 0
	for _, r := range s {
		if r < '0' || r > '9' {
			break
		}
		n = n*10 + int(r-'0')
	}
	return n
}

func runBlame(root, path string) blameResult {
	res := blameResult{Path: path, Lines: []string{}, Confidence: "unknown"}
	if !gitAvailable() || !hasGitDir(root) {
		return res
	}
	out, err := runGit(root, "blame", "--line-porcelain", "--", path)
	if err != nil {
		return res
	}
	author := "?"
	sc := bufio.NewScanner(strings.NewReader(out))
	buf := make([]byte, 0, 64*1024)
	sc.Buffer(buf, 1024*1024)
	for sc.Scan() {
		line := sc.Text()
		if strings.HasPrefix(line, "author ") {
			author = line[len("author "):]
		} else if strings.HasPrefix(line, "\t") {
			res.Lines = append(res.Lines, author+": "+line[1:])
			if len(res.Lines) >= maxBlameLines {
				break
			}
		}
	}
	res.Confidence = "confirmed"
	return res
}

func runLog(root string, limit int) logResult {
	res := logResult{Entries: []string{}, Confidence: "unknown"}
	if !gitAvailable() || !hasGitDir(root) {
		return res
	}
	out, err := runGit(root, "log", fmt.Sprintf("-n%d", limit), "--pretty=format:%h %s (%an)")
	if err != nil {
		return res
	}
	sc := bufio.NewScanner(strings.NewReader(out))
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line != "" {
			res.Entries = append(res.Entries, line)
		}
	}
	res.Confidence = "confirmed"
	return res
}
