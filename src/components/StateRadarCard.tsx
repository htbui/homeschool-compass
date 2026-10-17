import { View } from 'react-native';

import { TIER_INFO, VERIFY_NOTICE, type StateLaw } from '@/lib/states';
import { Card, Pill, Row, space, T, useColors } from '@/ui';

/** The "Legal Radar" summary for one state. */
export function StateRadarCard({ law, compact }: { law: StateLaw; compact?: boolean }) {
  const c = useColors();
  const tier = TIER_INFO[law.tier];
  const facts = [
    `Ages ${law.compulsoryAges[0]}–${law.compulsoryAges[1]}`,
    law.noticeRequired ? 'Notice required' : 'No notice',
    law.requiredDays ? `${law.requiredDays} days/yr` : null,
    law.requiredHours ? `${law.requiredHours} hrs/yr` : null,
    law.testingRequired ? 'Assessments' : null,
    law.portfolioRequired ? 'Portfolio' : null,
  ].filter(Boolean) as string[];

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }} wrap>
        <T v="heading">⚖️ {law.name} Legal Radar</T>
        <Pill text={tier.label} fg="#fff" bg={tier.color} />
      </Row>
      <T muted>{tier.blurb}</T>
      <Row wrap gap={6}>
        {facts.map((f) => (
          <Pill key={f} text={f} />
        ))}
      </Row>
      {law.noticeNote ? <T v="caption">📬 {law.noticeNote}</T> : null}
      {!compact ? (
        <View style={{ gap: 4, marginTop: space.xs }}>
          {law.requirements.map((r) => (
            <T key={r} v="caption">• {r}</T>
          ))}
        </View>
      ) : null}
      {law.funding.length > 0 ? (
        <View style={{ backgroundColor: c.successSoft, borderRadius: 10, padding: space.md, gap: 4, marginTop: space.xs }}>
          <T v="label" color={c.success}>💰 Funding radar</T>
          {law.funding.map((f) => (
            <T key={f.name} v="caption">
              <T v="caption" style={{ fontWeight: '700' }}>{f.name}</T>
              {f.approxAmount ? ` (${f.approxAmount})` : ''} — {f.note}
            </T>
          ))}
        </View>
      ) : null}
      <View style={{ backgroundColor: c.accentSoft, borderRadius: 10, padding: space.md, marginTop: space.xs }}>
        <T v="caption">
          🏈 Public-school activities:{' '}
          {law.activitiesAccess === 'statewide' ? 'state law gives homeschoolers access (rules vary).' : law.activitiesAccess === 'district' ? 'up to each district — ask yours.' : 'generally not available.'}
        </T>
      </View>
      <T v="caption" muted>{VERIFY_NOTICE}</T>
    </Card>
  );
}
