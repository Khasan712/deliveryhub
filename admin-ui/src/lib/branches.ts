import type { Lang } from '../i18n/translate'

const UZ_CYRILLIC = /[а-яёўқғҳ]/i

/**
 * A branch name in the Uzbek dative («-ga»), for «Chilonzorga yuborish»: «-ka» after k / g, «-qa» after q and g'
 * (which turns into q: «Tog'» → «Toqqa»), «-ga» after anything else; a number takes a hyphen («2-ga»). A name that
 * ends in a sign (a bracket, a quote) gets «filialiga» instead — always right, if longer.
 */
export function uzDative(name: string): string {
  const word = name.trim()
  if (!word) return word
  const cyrillic = UZ_CYRILLIC.test(word)
  if (/\d$/.test(word)) return `${word}-${cyrillic ? 'га' : 'ga'}`
  if (/[gG]['‘’ʻ`]$/.test(word)) return `${word.slice(0, -2)}${word.at(-2) === 'G' ? 'Q' : 'q'}qa`
  if (/ғ$/i.test(word)) return `${word.slice(0, -1)}${word.at(-1) === 'Ғ' ? 'Қ' : 'қ'}қа`
  const last = word.at(-1) ?? ''
  if (!/\p{L}/u.test(last)) return `${word} filialiga`
  if (cyrillic) {
    if (/[кг]$/i.test(word)) return `${word}ка`
    if (/қ$/i.test(word)) return `${word}қа`
    return `${word}га`
  }
  if (/[kg]$/i.test(word)) return `${word}ka`
  if (/q$/i.test(word)) return `${word}qa`
  return `${word}ga`
}

/** The variables of the phrases that name a branch: `{name}` as it is, `{to}` — where to (the Uzbek dative). */
export function branchVars(name: string): { name: string; to: string } {
  return { name, to: uzDative(name) }
}

/** A straight-line distance: «2,1 km» / «2,1 км» (the API rounds it to 0.1 km). */
export function formatDistance(km: number, lang: Lang): string {
  const value = (Math.round(km * 10) / 10).toFixed(1).replace('.', ',')
  return `${value} ${lang === 'ru' ? 'км' : 'km'}`
}
