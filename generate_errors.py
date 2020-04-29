open("./src/errors.ts", "w").write("//////////////\n\n".join(['''\
interface %(errorName)s extends Error {
}

interface %(errorName)sConstructor extends ErrorConstructor {
  new(message?: string): %(errorName)s,
  (message?: string): %(errorName)s,
  readonly prototype: %(errorName)s,
}

export const %(errorName)s: %(errorName)sConstructor = function(this: %(errorName)s | void, message?: string) {
  if (!(this instanceof %(errorName)s)) {
    return new %(errorName)s(message)
  } else {
    this!.message = message
    return undefined
  }
} as %(errorName)sConstructor

''' % {"errorName": errorName} for errorName in [
  "ConfigTypeError",
  "ConfigValueError",
  "EntityTypeError",
  "EntityValueError",
]]))
