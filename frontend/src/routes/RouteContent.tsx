import { renderRouteDescriptor } from './routeRenderer'
import { resolveRouteDescriptor, type RouteInputs } from './routeResolver'
import { AppShell } from './AppShell'

function matchRoute(inputs: RouteInputs) {
  return renderRouteDescriptor(resolveRouteDescriptor(inputs), inputs)
}

export { matchRoute, AppShell }
export type { RouteInputs }
