import { router } from 'expo-router';

import { Card, Screen, Section, Stack, T } from '@/ui';

const PATHS = [
  { from: 'scratch', icon: '✏️', title: 'Start from scratch', body: 'Plan your own units and lessons. You choose the license and the price.' },
  { from: 'web', icon: '🌐', title: 'Adapt a free online curriculum', body: 'Turn an openly licensed course into a ready-to-teach plan. It keeps the original’s license and credits it.' },
  { from: 'sheet', icon: '📊', title: 'Import a spreadsheet or list', body: 'Paste lesson rows from Google Sheets, Excel, or a CSV — or any outline you already wrote.' },
  { from: 'book', icon: '📕', title: 'Convert a book you own', body: 'Paste its table of contents to get a lesson-by-lesson plan with page ranges. Stays private to your family.' },
] as const;

/** Pick how to start a curriculum. */
export default function NewCurriculum() {
  return (
    <Screen edges={[]}>
      <Section title="How do you want to start?">
        <Stack>
          {PATHS.map((p) => (
            <Card key={p.from} onPress={() => router.push({ pathname: '/studio/import', params: { from: p.from } })}>
              <T v="heading">{p.icon} {p.title}</T>
              <T muted>{p.body}</T>
            </Card>
          ))}
        </Stack>
      </Section>
    </Screen>
  );
}
