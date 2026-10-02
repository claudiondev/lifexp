import { Download } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/apiClient';
import { fetchExport } from './accountApi';
import { downloadFile } from './downloadFile';

/** Exportar os próprios dados (RF06, RS15): um arquivo JSON com tudo, sem senhas nem tokens. */
export function DataExportCard() {
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const { blob, fileName } = await fetchExport();
      downloadFile(blob, fileName);
      toast.success('Seus dados foram baixados');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Não foi possível baixar os dados');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-labelledby="export-title"
      className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card/80 p-5 backdrop-blur sm:p-6"
    >
      <div className="max-w-xl">
        <h2 id="export-title" className="font-display text-xl font-bold">
          Seus dados
        </h2>
        <p className="text-sm text-muted-foreground">
          Baixe uma cópia de tudo o que é seu: áreas, blocos, conclusões, XP, metas, eventos e
          avisos, em JSON. Senhas e tokens nunca entram no arquivo.
        </p>
      </div>
      <Button variant="secondary" disabled={busy} onClick={() => void download()}>
        <Download aria-hidden className="size-4" />
        {busy ? 'Preparando...' : 'Baixar meus dados'}
      </Button>
    </section>
  );
}
