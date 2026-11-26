/** The pupil reader's calls (server/src/reader/routes.ts). The pupil sign-in cookie rides along; no token, no workspace. */
import type { Highlight, HighlightFields, PupilReading, PupilReadingItem, ReaderAskBody, ReaderAskResult } from '@edw/shared';
import { api } from '../api/http';
import { endpoints } from '../api/endpoints';

export const fetchReadings = async () => (await api<{ readings: PupilReadingItem[] }>('GET', endpoints.pupilReadings())).readings;
export const fetchReading = async (id: string) => (await api<{ reading: PupilReading }>('GET', endpoints.pupilReading(id))).reading;
export const fetchHighlights = async (id: string) => (await api<{ highlights: Highlight[] }>('GET', endpoints.pupilHighlights(id))).highlights;
export const saveHighlight = async (id: string, h: HighlightFields) => (await api<{ highlight: Highlight }>('POST', endpoints.pupilHighlights(id), h)).highlight;
export const deleteHighlight = (id: string, highlightId: string) => api<void>('DELETE', endpoints.pupilHighlights(id, highlightId));
export const askAbout = async (id: string, body: ReaderAskBody) => (await api<ReaderAskResult>('POST', endpoints.pupilAsks(id), body)).ask;
