package main

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseTrailingInt(t *testing.T) {
	if parseTrailingInt("12]") != 12 {
		t.Fatalf("expected 12")
	}
	if parseTrailingInt("0,") != 0 {
		t.Fatalf("expected 0")
	}
}

func TestStatusJSONShape(t *testing.T) {
	root := gitFixture(t)
	st := runStatus(root)
	if !st.Available {
		t.Fatal("expected available")
	}
	if st.Branch == nil || *st.Branch == "" {
		t.Fatal("expected branch")
	}
	b, err := json.Marshal(st)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(b), `"confidence":"confirmed"`) {
		t.Fatalf("bad json: %s", b)
	}
}

func TestLogEntries(t *testing.T) {
	root := gitFixture(t)
	log := runLog(root, 5)
	if log.Confidence != "confirmed" {
		t.Fatal(log.Confidence)
	}
	if len(log.Entries) == 0 {
		t.Fatal("expected at least one commit")
	}
}

func TestBlameLines(t *testing.T) {
	root := gitFixture(t)
	blame := runBlame(root, "readme.txt")
	if blame.Confidence != "confirmed" {
		t.Fatal(blame.Confidence)
	}
	if len(blame.Lines) == 0 {
		t.Fatal("expected blame lines")
	}
	if !strings.Contains(blame.Lines[0], ":") {
		t.Fatalf("unexpected line: %q", blame.Lines[0])
	}
}

func gitFixture(t *testing.T) string {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	dir := t.TempDir()
	run := func(args ...string) {
		t.Helper()
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		cmd.Env = append(os.Environ(),
			"GIT_AUTHOR_NAME=Arcframe",
			"GIT_AUTHOR_EMAIL=arc@example.com",
			"GIT_COMMITTER_NAME=Arcframe",
			"GIT_COMMITTER_EMAIL=arc@example.com",
		)
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
	}
	run("init")
	run("config", "user.email", "arc@example.com")
	run("config", "user.name", "Arcframe")
	path := filepath.Join(dir, "readme.txt")
	if err := os.WriteFile(path, []byte("hello\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	run("add", "readme.txt")
	run("commit", "-m", "init")
	return dir
}
