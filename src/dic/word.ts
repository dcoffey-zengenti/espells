/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { iterate } from "iterare"
import type { Aff, Flag, Flags, FlagSet } from "../aff/index.js"
import type { Prefix, Suffix } from "../aff/affix.js"
import { RepPattern } from "../aff/rep-pattern.js"
import { CapType, CONSTANTS as C } from "../constants.js"
import { split } from "../util.js"

/** A word as found in a {@link Dic} instance's index. */
export class Word {
  /** The raw stem of the word, as parsed from the `.dic` file. */
  declare stem: string

  /** The capitalization type of this word. */
  declare capType: CapType

  // using optionals here to save on memory

  /** The {@link Flags} that this word is associated with. */
  declare flags?: Flags

  /**
   * Misc. data that the word was associated with in the `.dic` file. e.g.
   * determining if `is:gendered` is associated with a word would be
   * `word.data.get("is").has("gendered")`.
   */
  declare data?: Map<string, Set<string>>

  /** Common misspellings for this word. */
  declare altSpellings?: Set<string>

  /** The {@link Affix} instances that apply to this word. */
  declare affixes?: {
    prefixes: Set<Prefix>
    suffixes: Set<Suffix>
  }

  /**
   * @param line - The line from a `.dic` file to parse. Can also just be
   *   treated as a "word" argument.
   * @param aff - {@link Aff} data to use.
   */
  constructor(line: string, private aff: Aff) {
    // a hack so that the split regex doesn't get confused with escapes
    line = line.replaceAll("\\/", "_||_")

    const match = C.SPLIT_WORD_REGEX.exec(line)
    if (!match) throw new SyntaxError(`Invalid line in dictionary '${line}'`)
    let [, stem, flags, data] = match

    stem = stem.replaceAll("_||_", "/")
    stem = aff.ignore(stem)

    this.stem = stem
    this.capType = aff.casing.guess(stem)

    if (flags) this.flags = aff.parseFlags(flags)

    if (data) {
      for (const keyvalue of split(data)) {
        const match = C.SPLIT_DATA_REGEX.exec(keyvalue)

        // key:value pair
        if (match) {
          const [, key, value] = match

          this.data ??= new Map()
          const set = this.data.get(value) ?? new Set()
          this.data.set(key, set.add(value))

          // ph: misspellings
          if (key === "ph") {
            // pretty ph:prit* -> rep(prit, prett)
            if (value.endsWith("*")) {
              aff.REP.add(new RepPattern(value.slice(0, -2), stem.slice(0, -1)))
            }
            // happy ph:hepi->happi -> rep(hepi, happi)
            else if (value.includes("->")) {
              const [from, to] = value.split("->")
              aff.REP.add(new RepPattern(from, to))
            }
            // wednesday ph:wensday -> rep(wensday, wednesday)
            // and altSpelling added for ngram suggestions
            else {
              aff.REP.add(new RepPattern(value, stem))
              this.altSpellings ??= new Set()
              this.altSpellings.add(value)
            }
          }
        }
        // morphology alias
        else if (/^\d+$/.test(keyvalue) && aff.AM[parseInt(keyvalue) - 1]) {
          for (const str in aff.AM[parseInt(keyvalue) - 1]) {
            this.data ??= new Map()
            const set = this.data.get(keyvalue) ?? new Set()
            this.data.set(keyvalue, set.add(str))
          }
        }
      }
    }
  }

  /**
   * Determines if this word has the given flag.
   *
   * @param flag - The flag to check for. Can be undefined, which will return false.
   */
  has(flag?: Flag) {
    if (flag === undefined) return false
    return this.flags?.has(flag) ?? false
  }

  /**
   * Returns the forms (permutations) of this {@link Word}, with all valid
   * suffixes and prefixes.
   *
   * @param similarTo - The string/word that the forms found should be similar to.
   */
  forms(similarTo?: string) {
    const res: string[] = [this.stem]

    if (!this.flags) return res

    const affixes = {
      prefixes: iterate(this.flags)
        .filter(flag => this.aff.PFX.has(flag))
        .map(flag => this.aff.PFX.get(flag)!)
        .flatten()
        .filter(prefix => prefix.relevant(this.stem))
        .toSet(),

      suffixes: iterate(this.flags)
        .filter(flag => this.aff.SFX.has(flag))
        .map(flag => this.aff.SFX.get(flag)!)
        .flatten()
        .filter(suffix => suffix.relevant(this.stem))
        .toSet(),
    };

    const suffixes = iterate(affixes.suffixes)
      .filter(suffix => (similarTo ? similarTo.endsWith(suffix.add) : true))
      .toArray()

    const prefixes = iterate(affixes.prefixes)
      .filter(prefix => (similarTo ? similarTo.startsWith(prefix.add) : true))
      .toArray()

    const cross = iterate(prefixes)
      .map(prefix =>
        iterate(suffixes)
          .filter(suffix => suffix.crossproduct && prefix.crossproduct)
          .map(suffix => [prefix, suffix] as [Prefix, Suffix])
          .toArray()
      )
      .flatten()
      .toArray()

    for (const suffix of suffixes) {
      const root = suffix.strip ? this.stem.slice(0, -suffix.strip.length) : this.stem
      res.push(root + suffix.add)
    }

    for (const [prefix, suffix] of cross) {
      const root = suffix.strip
        ? this.stem.slice(prefix.strip.length, -suffix.strip.length)
        : this.stem.slice(prefix.strip.length)
      res.push(prefix.add + root + suffix.add)
    }

    for (const prefix of prefixes) {
      const root = this.stem.slice(prefix.strip.length)
      res.push(prefix.add + root)
    }

    return res
  }

  /**
   * Utility function for generating a {@link FlagSet} from an array of words.
   *
   * @param words - The words to generate the flag set from.
   */
  static flagSets(words: Word[]): FlagSet {
    return new Set(words.filter(word => word.flags).map(word => new Set(word.flags!)))
  }
}
