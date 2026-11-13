export { cn } from "cn"

/** «1 acción», «3 acciones», «0 acciones». */
export function plural(n: number, singular: string, varios: string) {
  return `${n} ${n === 1 ? singular : varios}`;
}
