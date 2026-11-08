/** Copyright 2026 GetMCPAds. SPDX-License-Identifier: Apache-2.0 */
/**
 * Conversions de montants vers l'unité attendue par chaque plateforme.
 *
 * Un assistant qui compose un appel raisonne en euros. Les quatre plateformes
 * attendent quatre unités différentes, et se tromper d'unité ne produit pas
 * une erreur : Google accepte volontiers un budget de 12 micros, soit 0,000012
 * unité, ou de 12 000 000 000 micros si le facteur est appliqué deux fois.
 * L'appel réussit, et c'est le compte du client qui encaisse.
 *
 * D'où des fonctions nommées, testées, plutôt que des multiplications posées
 * en ligne dans chaque outil.
 */

/** Un montant que la plateforme peut recevoir : positif, fini, raisonnable. */
function guard(amount: number, currency: string): number {
  if (!Number.isFinite(amount)) throw new Error(`Amount must be a finite number, received ${amount}.`);
  if (amount <= 0) throw new Error(`Amount must be greater than zero, received ${amount}.`);
  // Un million d'unités de devise par jour n'est pas un budget, c'est une
  // faute de frappe ou une double conversion.
  if (amount > 1_000_000) {
    throw new Error(
      `Amount ${amount} ${currency} is above the safety ceiling of 1,000,000. ` +
        "If this is intentional, make the change in the platform's own interface.",
    );
  }
  return amount;
}

/** Google Ads : micro-unités de la devise du compte. */
export function toMicros(amount: number): number {
  return Math.round(guard(amount, "units") * 1_000_000);
}

/**
 * Pinterest : micro-unités de la devise du compte, comme Google Ads.
 *
 * Les champs s'appellent `*_in_micro_currency` et `daily_spend_cap` suit la
 * même échelle. La passerelle a longtemps converti en millièmes : un plafond
 * demandé à 50 EUR partait à 0,05 EUR, la campagne s'arrêtait aussitôt et
 * l'appel répondait pourtant « appliqué ».
 */
export function toMicroCurrency(amount: number): number {
  return Math.round(guard(amount, "units") * 1_000_000);
}

/**
 * Meta : sous-unité de la devise du compte, en entier.
 *
 * Le facteur dépend de la devise. Le yen et le won n'ont pas de sous-unité,
 * donc y envoyer 1250 pour 12,50 multiplierait la dépense par cent.
 */
const ZERO_DECIMAL = new Set(["JPY", "KRW", "CLP", "ISK", "VND", "UGX", "PYG", "RWF", "XOF", "XAF", "XPF", "BIF", "DJF", "GNF", "KMF", "MGA", "VUV"]);

export function toMinorUnits(amount: number, currency: string): number {
  const code = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new Error(`Expected a three letter currency code, received "${currency}".`);
  const factor = ZERO_DECIMAL.has(code) ? 1 : 100;
  return Math.round(guard(amount, code) * factor);
}

/** TikTok reçoit le montant tel quel, dans la devise du compte. */
export function toPlainAmount(amount: number): number {
  return Number(guard(amount, "units").toFixed(2));
}
