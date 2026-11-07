import { useState } from 'react';
import { Platform } from 'react-native';

import { testPageHtml } from '@/lib/worksheet';
import { canChoosePrinter, choosePrinter } from '@/services/exportDoc';
import { runPrint } from '@/services/printing';
import { usePrinter, type Paper, type PrinterConfig } from '@/store/usePrinter';
import { Button, Card, Chip, Row, Sheet, Stack, T, useColors } from '@/ui';

const HOW_TO: Record<string, string> = {
  ios: 'Your iPhone or iPad prints with AirPrint. Make sure the printer is on and on the same Wi-Fi network.',
  android:
    'Android prints through its print service. Most Wi-Fi printers work with the built-in Default Print Service or Mopria; some brands need their plugin from the Play Store (Settings → Connected devices → Printing). Make sure the printer is on the same Wi-Fi network.',
  web: 'Your browser’s print dialog lists every printer this computer knows about, and “Save as PDF”. Add a printer in your computer’s settings if it isn’t listed.',
};

/** Mounted once at the root; opens the first time someone prints on this device, or from Settings. */
export function PrintSetupSheet() {
  const open = usePrinter((s) => s.setupOpen);
  return open ? <SetupForm /> : null;
}

function SetupForm() {
  const c = useColors();
  const { config, pending, save, closeSetup } = usePrinter();
  const [mode, setMode] = useState<PrinterConfig['mode']>(config?.mode ?? (canChoosePrinter ? 'saved' : 'dialog'));
  const [printer, setPrinter] = useState<{ name: string; url: string } | undefined>(config?.url ? { name: config.name ?? 'Printer', url: config.url } : undefined);
  const [paper, setPaper] = useState<Paper>(config?.paper ?? 'letter');
  const [busy, setBusy] = useState('');
  const ready = mode === 'dialog' || !!printer;

  const apply = () => save({ mode, paper, name: mode === 'saved' ? printer?.name : undefined, url: mode === 'saved' ? printer?.url : undefined });

  const pick = async () => {
    setBusy('pick');
    const p = await choosePrinter();
    setBusy('');
    if (p) {
      setPrinter(p);
      setMode('saved');
    }
  };

  const test = async () => {
    apply();
    setBusy('test');
    await runPrint(testPageHtml(mode === 'saved' ? printer?.name : undefined));
    setBusy('');
  };

  const done = async () => {
    apply();
    const job = pending;
    closeSetup();
    if (job) await runPrint(job.html);
  };

  return (
    <Sheet visible onClose={closeSetup} title={config ? 'Printing' : 'Set up printing'}>
      {pending && !config ? <T muted>Before printing “{pending.title}”, let&apos;s set up printing on this device (grown-ups, this takes a few seconds).</T> : null}
      <T>{HOW_TO[Platform.OS] ?? HOW_TO.web}</T>

      {canChoosePrinter ? (
        <Stack gap={6}>
          <T v="label">Printer</T>
          <Card tint={mode === 'saved' && printer ? c.successSoft : undefined}>
            <T v="heading">{printer ? `🖨️ ${printer.name}` : 'No printer chosen yet'}</T>
            <T v="caption" muted>Prints go straight to this printer — no dialog each time.</T>
            <Row wrap>
              <Button size="sm" title={printer ? 'Choose a different printer' : 'Choose printer'} loading={busy === 'pick'} onPress={pick} />
              {printer ? <Chip label={`${mode === 'saved' ? '✓' : '○'} Use this printer`} selected={mode === 'saved'} onPress={() => setMode('saved')} /> : null}
            </Row>
          </Card>
          <Chip label={`${mode === 'dialog' ? '✓' : '○'} Ask me in the print dialog every time`} selected={mode === 'dialog'} onPress={() => setMode('dialog')} />
        </Stack>
      ) : null}

      <Stack gap={6}>
        <T v="label">Paper size</T>
        <Row wrap gap={6}>
          <Chip label="US Letter (8.5 × 11 in)" selected={paper === 'letter'} onPress={() => setPaper('letter')} />
          <Chip label="A4" selected={paper === 'a4'} onPress={() => setPaper('a4')} />
        </Row>
      </Stack>

      <Row wrap style={{ justifyContent: 'flex-end' }}>
        <Button kind="secondary" title="Print a test page" disabled={!ready} reason="Choose a printer first" loading={busy === 'test'} onPress={test} />
        <Button title={pending ? 'Save & print' : 'Save'} disabled={!ready} reason="Choose a printer, or use the print dialog" onPress={done} />
      </Row>
    </Sheet>
  );
}
