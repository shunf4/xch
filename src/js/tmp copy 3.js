class A {
  fuck() {
    const b = new B()
    console.log(`b: ${b}`)
  }
}

class B {
  constructor() {
    this.a = new A()
  }
}

new B().a.fuck()