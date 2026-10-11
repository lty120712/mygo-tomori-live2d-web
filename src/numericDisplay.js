// Fractional controls use percentages; model/project values remain in native units.
export function numericDisplay(key, field) {
  const percent = key === '@scale' || key === '@opacity' || (!key.startsWith('@') && field?.step < 1)
  const factor = percent ? 100 : 1
  return {
    unit: percent ? '%' : '',
    min: field ? Math.ceil(field.min * factor) : undefined,
    max: field ? Math.floor(field.max * factor) : undefined,
    toDisplay: value => Math.round(Number(value) * factor),
    toNative: value => Math.round(Number(value)) / factor,
  }
}
