# typescript-app fixture
export function greet(name: string): string {
  return `hello ${name}`;
}

export class Greeter {
  greet(name: string) {
    return greet(name);
  }
}
