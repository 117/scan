export function change(params: { from: number; to: number; factor?: 1 | 100 }) {
  return ((params.to - params.from) / params.from) * (params.factor ?? 100)
}

export default {
  change: change,
}
