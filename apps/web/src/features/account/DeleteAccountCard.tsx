import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '../auth/useAuth';
import { TextField } from '../auth/TextField';
import { useServerError } from '../auth/useAuthForm';
import { deleteAccount } from './accountApi';

/** O que a pessoa precisa digitar para liberar o botão: evita um clique por engano. */
export const CONFIRM_WORD = 'EXCLUIR';

/** Excluir a conta (RS15): irreversível, pede a senha e uma confirmação digitada. */
export function DeleteAccountCard() {
  const [open, setOpen] = useState(false);

  return (
    <section
      aria-labelledby="delete-title"
      className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-destructive/40 bg-destructive/5 p-5 sm:p-6"
    >
      <div className="max-w-xl">
        <h2 id="delete-title" className="font-display text-xl font-bold">
          Excluir a conta
        </h2>
        <p className="text-sm text-muted-foreground">
          Apaga a sua conta e todos os dados dela, sem volta. Se quiser guardar uma cópia, baixe
          seus dados antes.
        </p>
      </div>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Excluir minha conta
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          {/* key: o formulário recomeça vazio a cada abertura. */}
          {open && <DeleteForm onCancel={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function DeleteForm({ onCancel }: { onCancel: () => void }) {
  const { logout } = useAuth();
  const { serverError, run } = useServerError();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const confirmed = confirmation === CONFIRM_WORD && password.length > 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!confirmed) return;
    setBusy(true);
    void run(async () => {
      try {
        await deleteAccount({ password });
        toast.success('Conta excluída. Seus dados foram apagados.');
        // O servidor já encerrou a sessão; sair aqui limpa a memória e leva ao login.
        await logout();
      } finally {
        setBusy(false);
      }
    });
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <div>
        <DialogTitle>Excluir a conta?</DialogTitle>
        <DialogDescription>
          Esta ação apaga tudo: áreas, blocos, XP, metas, eventos e avisos. Não dá para desfazer.
        </DialogDescription>
      </div>
      <TextField
        label="Sua senha"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <TextField
        label={`Digite ${CONFIRM_WORD} para confirmar`}
        autoComplete="off"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
      />
      {serverError && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {serverError}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" variant="destructive" disabled={!confirmed || busy}>
          {busy ? 'Excluindo...' : 'Excluir para sempre'}
        </Button>
      </div>
    </form>
  );
}
