
function Base() {
  this.data = "mother"
}

Base.prototype.fuck = function() {
  console.log(this.data)
}

const b = new Base()

const c = b.fuck.bind(b)

c()
