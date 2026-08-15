package main

import "fmt"

func Greet(name string) string {
	return fmt.Sprintf("hello %s", name)
}

func main() {
	fmt.Println(Greet("arcframe"))
}
