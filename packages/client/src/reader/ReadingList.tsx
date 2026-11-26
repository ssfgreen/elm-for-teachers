/** The pupil's readings on `/r` (#213), newest first, each a link to the reader. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PupilReadingItem } from '@edw/shared';
import { linkClass } from '../screens/landing/styles';
import { fetchReadings } from './readerApi';

const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });

export function ReadingList() {
  const [readings, setReadings] = useState<PupilReadingItem[] | null | 'failed'>(null);
  useEffect(() => {
    let live = true;
    fetchReadings()
      .then((r) => live && setReadings(r))
      .catch(() => live && setReadings('failed'));
    return () => {
      live = false;
    };
  }, []);
  if (readings === null) return <p className="mb-4">Loading your readings…</p>;
  if (readings === 'failed') return <p className="mb-4">Your readings could not be loaded. Please reload the page.</p>;
  if (readings.length === 0) return <p className="mb-4">There is nothing to do yet. Your teacher will tell you when there is.</p>;
  return (
    <section aria-label="Your readings" className="mb-4 text-left">
      <h2 className="mb-2 font-semibold text-foreground">Your readings</h2>
      <ul className="flex flex-col gap-2">
        {readings.map((r) => (
          <li key={r.id}>
            <Link className={linkClass} to={`/r/readings/${encodeURIComponent(r.id)}`}>
              {r.name}
            </Link>
            <span className="block text-sm">
              {r.class_name}, set on {day(r.set_on)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
