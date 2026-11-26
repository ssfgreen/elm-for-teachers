/**
 * A source's licence as the teacher reads it. Most were not confirmed when the library was
 * gathered (Sam, 12 Nov 2026: a research project for now, licences to be worked out later), so
 * one recorded as TODO, unconfirmed or unknown reads "(licence unconfirmed)". Pure.
 */
const UNCONFIRMED = /TODO|UNCONFIRMED|not confirmed|unknown|not stated|unclear/i;

export function licenceLabel(licence: string | null | undefined): string {
  const l = (licence ?? '').trim();
  if (!l || UNCONFIRMED.test(l)) return '(licence unconfirmed)';
  // The licence itself, without the curator's notes on how it was found.
  return l.split(/[(;]/)[0]!.trim();
}
