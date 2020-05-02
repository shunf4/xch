export type CommonNormalizeOption = {
  checkReations?: boolean,
}

export function completeNormalizeOption(option: CommonNormalizeOption): void {
  if (option.checkReations === undefined) {
    option.checkReations = true
  }
}