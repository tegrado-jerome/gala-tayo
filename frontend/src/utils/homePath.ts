/** `/` is the only home URL. Old `/home` links and stored return paths land there, keeping their query. */
export function toHomePath(path: string) {
  return path.replace(/^\/home\/?(?=$|[?#])/, '/')
}
