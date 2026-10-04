import { createContext, useContext } from 'react'

/** The menu search: typed in the header on wide screens, in the menu itself on phones. */
export interface SearchContextValue {
  query: string
  setQuery: (query: string) => void
}

export const SearchContext = createContext<SearchContextValue | null>(null)

export function useSearch(): SearchContextValue {
  const context = useContext(SearchContext)
  if (!context) throw new Error('useSearch() must be used inside <SearchContext>')
  return context
}
