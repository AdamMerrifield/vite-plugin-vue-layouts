import { ResolvedOptions } from './types'

function getClientCode(importCode: string, options: ResolvedOptions) {
  const code = `
${importCode}

export function setupLayouts(routes) {
  function deepSetupLayout(routes) {
    return routes.map(route => {
      if (route.children?.length > 0) {
        return { ...route, children: deepSetupLayout(route.children) }
      }
      const isBoolean = typeof route.meta?.layout === 'boolean'
      if(isBoolean && !route.meta?.layout) {
        return route
      }
      const componentName = !isBoolean && route.meta?.layout ? route.meta?.layout : '${options.defaultLayout}'
      return {
        path: route.path,
        component: layouts[componentName],
        children: route.path === '/' ? [route] : [{...route, path: ''}]
      }
    })
  }

  return deepSetupLayout(routes)
}
`
  return code
}

export default getClientCode
