/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { Prefix, Suffix } from "../aff/affix.js"
import type { Word } from "../dic/word.js"
import { concat } from "../util.js"
import { LKWord } from "./lk-word.js"

export interface AffixFormOpts {
  /** Outermost prefix. */
  prefix?: Prefix

  /** Outermost suffix. */
  suffix?: Suffix

  /** Innermost prefix. */
  prefix2?: Prefix

  /** Innermost suffix. */
  suffix2?: Suffix

  /** The word as found in the spellchecker's dictionary. */
  inDictionary?: Word
}

/**
 * Represents a hypothesis of how a word may be represented as a
 * {@link Prefix}, stem, and {@link Suffix}. A word always has a full text
 * and stem, but may optionally have up to two prefixes and suffixes.
 * Instances with no actual affixes are valid, as well.
 */
export class AffixForm {
  /** The full text of the word. */
  declare text: string

  /** The hypothesized stem of the word. */
  declare stem: string

  /** Outermost prefix. */
  declare prefix?: Prefix

  /** Outermost suffix. */
  declare suffix?: Suffix

  /** Innermost prefix. */
  declare prefix2?: Prefix

  /** Innermost suffix. */
  declare suffix2?: Suffix

  /** The word as found in the spellchecker's dictionary. */
  declare inDictionary?: Word

  constructor(
    text: string | LKWord,
    stem?: string,
    { prefix, suffix, prefix2, suffix2, inDictionary }: AffixFormOpts = {}
  ) {
    if (text instanceof LKWord) {
      this.text = text.word
      this.stem = stem ?? text.word
    } else {
      this.text = text
      this.stem = stem ?? text
    }

    this.prefix = prefix
    this.suffix = suffix
    this.prefix2 = prefix2
    this.suffix2 = suffix2
    this.inDictionary = inDictionary
  }

  /**
   * Returns a new {@link AffixForm}, cloned from this current instance, but
   * with any properties given replaced.
   */
  replace(opts: { text?: string | LKWord; stem?: string } & AffixFormOpts) {
    return new AffixForm(opts.text ?? this.text, opts.stem ?? this.stem, {
      prefix: opts.prefix ?? this.prefix,
      suffix: opts.suffix ?? this.suffix,
      prefix2: opts.prefix2 ?? this.prefix2,
      suffix2: opts.suffix2 ?? this.suffix2,
      inDictionary: opts.inDictionary ?? this.inDictionary
    })
  }

  /** True if the form has any affixes. */
  get hasAffixes() {
    return Boolean(this.suffix || this.prefix)
  }

  /** The complete set of flags this form has. */
  get flags() {
    let flags = this.inDictionary?.flags ?? new Set()
    if (this.prefix) flags = concat(flags, this.prefix.flags)
    if (this.suffix) flags = concat(flags, this.suffix.flags)
    return flags
  }

  /** Returns every {@link Prefix} and {@link Suffix} this form has. */
  affixes() {
    return [this.prefix2, this.prefix, this.suffix, this.suffix2].filter(affix =>
      Boolean(affix)
    ) as (Prefix | Suffix)[]
  }

  has(flag: string) {
    if (!this.hasAffixes) return false
    return this.affixes().every(affix => affix.has(flag))
  }
}
