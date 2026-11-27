const rtlFirst = /^[^\p{L}]*[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Adlam}]/u

/** dir for text that changes in place. Chrome resolves dir="auto" once and misses later text swaps inside a TextMorph, so a title that turns Arabic stays LTR; naming rtl explicitly re-resolves it, and everything else keeps auto. */
export const dirOf = (text: string) => (rtlFirst.test(text) ? "rtl" : "auto")
