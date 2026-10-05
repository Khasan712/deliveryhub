// Pages loaded on demand (the login and list pages do not need them) and preloaded once the browser is idle,
// so moving to them stays instant.
export const loadCreatePage = () => import('./BusinessCreatePage')
export const loadBusinessPage = () => import('./business/BusinessPage')
export const loadLeadsPage = () => import('./LeadsPage')
export const loadMobileAppPage = () => import('./MobileAppPage')

export function preloadPages() {
  void loadCreatePage()
  void loadBusinessPage()
  void loadLeadsPage()
  void loadMobileAppPage()
}
