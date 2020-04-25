import Ansi256Colors from "ansi-256-colors"
import __ from "underscore"

export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function colorForRgb(r: number, g: number, b: number): string {
  return Ansi256Colors.fg.getRgb(r, g, b).slice(7, -1)
}

export function defaultTo(defaultValue: any): (sth: any) => any {
  function partialDefaultTo(sth: any): any {
    if (sth === undefined || sth !== sth) {
      return defaultValue
    }
    return sth
  }

  return partialDefaultTo
}

export function doNotWait<T>(promise: Promise<T>): void {
  void(promise)
}

export function assignOptions(obj: any, options: any): void {
  for (const [k, v] of Object.entries(options)) {
    obj[k] = v
  }
}