import { Component, type ReactNode } from 'react'
import { Button, Empty, Page } from '../components/ui'

type Props = { children: ReactNode }
type State = { failed: boolean }

/**
 * Keeps the header and nav on screen when a page throws, most often a route chunk that can't load
 * (offline, or an open tab still asking for files an older deploy removed). Without it React unmounts
 * the whole app and leaves a blank white page. AppShell keys it by path, so leaving the page resets it.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    const offline = typeof navigator !== 'undefined' && !navigator.onLine
    return (
      <Page narrow>
        <Empty
          title="This page didn't load"
          description={offline ? "You're offline. Check your connection, then try again." : 'Something went wrong while loading it. Try again in a moment.'}
          action={<Button onClick={() => window.location.reload()}>Try again</Button>}
        />
      </Page>
    )
  }
}
