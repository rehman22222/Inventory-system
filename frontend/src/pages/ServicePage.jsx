import React from 'react'
import useSeo from '../lib/useSeo'

function ServicePage() {
  // Still a placeholder. Held out of the index until it has real content —
  // a thin page dragging down the site's quality signals is worse than no page.
  useSeo({
    title: 'About — E360 Inventory Suite',
    path: '/about',
    noindex: true,
  })

  return (
    <div>S</div>
  )
}

export default  ServicePage
