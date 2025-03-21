/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { iterate } from "iterare"
import type { Aff, Flag } from "../aff/index.js"
import { CapType, CONSTANTS as C } from "../constants.js"
import type { Reader } from "../reader.js"
import { Word } from "./word.js"

export { Word }

/** Hunspell dictionary data. */
export class Dic {
  /** The full set of {@link Word} entries in the dictionary. */
  words: Set<Word> = new Set()

  /**
   * A mapping of stems to {@link Word} entries. A stem may map to multiple
   * words, so the actual mapped value may either be a set or a singular
   * {@link Word} instance. Most stems won't map to multiple words, so for
   * the sake of saving memory a set is only used when it's actually needed.
   */
  private index: Map<string, Set<Word> | Word> = new Map()

  /**
   * A mapping of stems that weren't lowercase to begin with to their
   * {@link Word} instances.
   */
  private lowercaseIndex: Map<string, Set<Word>> = new Map()

  /** Spellchecker {@link Aff} data to use when parsing the dictionary. */
  private declare aff: Aff

  /**
   * @param reader - The {@link Reader} instance to use when parsing.
   * @param aff - The {@link Aff} data to use.
   */
  constructor(reader: Reader, aff: Aff) {
    this.aff = aff
    this.addDictionary(reader)
  }

  /**
   * Utility for adding a stem + {@link Word} to a index.
   *
   * @param index - Index to add the stem to.
   * @param stem - The stem entrypoint.
   * @param word - The mapped {@link Word}.
   */
  private addToIndex(index: Map<string, Set<Word> | Word>, stem: string, word: Word) {
    const curr = index.get(stem)
    if (curr) {
      if (curr instanceof Set) curr.add(word)
      else index.set(stem, new Set([curr, word]))
    } else {
      index.set(stem, word)
    }
  }

  /**
   * Utility for getting a {@link Word} set from an index.
   *
   * @param index - The index to retrieve the {@link Word} set from.
   * @param stem - The stem to search for.
   */
  private getFromindex(index: Map<string, Set<Word> | Word>, stem: string): Set<Word> {
    if (!index.has(stem)) return new Set()
    const words = index.get(stem)!
    // have to clone to prevent mutating the dictionary
    return words instanceof Set ? new Set([...words]) : new Set([words])
  }

  /**
   * Adds additional dictionary data.
   *
   * @param reader - The {@link Reader} to parse with.
   */
  addDictionary(reader: Reader) {
    do {
      if (reader.done) break
      if (C.DIC_SKIP_REGEX.test(reader.line)) continue
      this.add(new Word(reader.line, this.aff))
    } while (reader.next())
  }

  /**
   * Adds a word to the dictionary. Can accept flags.
   *
   * @param word - The word to add.
   */
  add(word: Word) {
    const stem = word.stem
    this.words.add(word)
    this.addToIndex(this.index, stem, word)
    if (this.aff.casing.guess(stem) !== CapType.NO) {
      const lowers = this.aff.casing.lower(stem)
      lowers.forEach(lowered => this.addToIndex(this.lowercaseIndex, lowered, word))
    }
  }

  /**
   * Removes a stem and any of its associated {@link Word} instances from
   * the dictionary.
   *
   * @param stem - The stem to remove.
   */
  remove(stem: string) {
    const words = this.homonyms(stem, true)
    if (!words) return
    for (const word of words) {
      this.words.delete(word)
    }
    this.index.delete(stem)
    const lowers = this.aff.casing.lower(stem)
    lowers.forEach(lowered => this.lowercaseIndex.delete(lowered))
  }

  /**
   * Retrieves all of the homonyms (all associated {@link Word} instances) for a stem.
   *
   * @param stem - The stem to retrieve with.
   * @param ignorecase - If true, the {@link Dic.lowercaseIndex} will be
   *   searched through as well.
   */
  homonyms(stem: string, ignorecase = false) {
    const words = this.getFromindex(this.index, stem)
    if (ignorecase) {
      const lowers = this.aff.casing.lower(stem)
      lowers.forEach(lowered =>
        iterate(this.getFromindex(this.lowercaseIndex, lowered)).forEach(word =>
          words.add(word)
        )
      )
    }
    return words
  }

  /**
   * Determines if the given stem has a {@link Flag} associated with it or not.
   *
   * @param stem - The stem to check.
   * @param flag - The flag to check. Can actually be undefined - which
   *   will just cause the function to return false.
   * @param all - If true, every homonym of the stem must have the flag given.
   */
  hasFlag(stem: string, flag?: Flag, all = false) {
    if (flag === undefined) return false

    let flagged = false

    for (const word of this.homonyms(stem)) {
      const has = word.has(flag)
      if (has) flagged = true
      if (all && !has) return false
      if (!all && has) return true
    }

    return all && flagged
  }
}
