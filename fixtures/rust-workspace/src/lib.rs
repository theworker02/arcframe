fn greet(name: &str) -> String {
    format!("hello {name}")
}

pub struct Greeter;

impl Greeter {
    pub fn greet(&self, name: &str) -> String {
        greet(name)
    }
}
