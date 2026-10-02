import {
  BLOCK_LEAD_OPTIONS,
  type NotificationPreferencesDto,
  type UpdateNotificationPreferencesInput,
} from '@lifexp/shared';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { leadLabel } from './notificationFormat';
import { useNotificationPreferences, useUpdateNotificationPreferences } from './useNotifications';

/** Preferências de notificação (RF40): cada mudança é salva na hora. */
export function NotificationPreferencesCard() {
  const preferences = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();

  const save = (input: UpdateNotificationPreferencesInput) =>
    update.mutate(input, {
      onSuccess: () => toast.success('Preferências salvas'),
      onError: (error) => toast.error(error.message),
    });

  return (
    <section
      aria-labelledby="notif-title"
      className="mt-6 rounded-2xl border border-border bg-card/80 p-5 backdrop-blur sm:p-6"
    >
      <h2 id="notif-title" className="font-display text-xl font-bold">
        Notificações
      </h2>
      <p className="text-sm text-muted-foreground">
        Escolha o que o LifeXP avisa e quando. Os avisos aparecem no sino do topo.
      </p>

      {preferences.isPending && (
        <div aria-busy="true" className="mt-4 h-40 animate-pulse rounded-xl bg-background/40" />
      )}

      {preferences.isError && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-4"
        >
          <p className="text-sm text-destructive">Não foi possível carregar as preferências.</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={() => void preferences.refetch()}
          >
            Tentar de novo
          </Button>
        </div>
      )}

      {preferences.isSuccess && (
        <PreferencesForm preferences={preferences.data} busy={update.isPending} onSave={save} />
      )}
    </section>
  );
}

function PreferencesForm({
  preferences,
  busy,
  onSave,
}: {
  preferences: NotificationPreferencesDto;
  busy: boolean;
  onSave: (input: UpdateNotificationPreferencesInput) => void;
}) {
  const [time, setTime] = useState(preferences.digestTime);

  const saveTime = () => {
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(time) && time !== preferences.digestTime) {
      onSave({ digestTime: time });
    } else {
      setTime(preferences.digestTime); // vazio ou inválido: volta ao valor salvo
    }
  };

  return (
    <div className="mt-4 flex flex-col gap-5">
      <Row
        id="pref-blocks"
        label="Lembrar dos blocos"
        hint="Um aviso pouco antes de cada bloco começar."
        checked={preferences.blockRemindersEnabled}
        disabled={busy}
        onChange={(value) => onSave({ blockRemindersEnabled: value })}
      >
        <div className="flex flex-col gap-1.5 sm:max-w-56">
          <Label htmlFor="pref-lead">Quanto antes</Label>
          <Select
            id="pref-lead"
            value={preferences.blockLeadMin}
            disabled={busy || !preferences.blockRemindersEnabled}
            onChange={(event) => onSave({ blockLeadMin: Number(event.target.value) as never })}
          >
            {BLOCK_LEAD_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {leadLabel(minutes)}
              </option>
            ))}
          </Select>
        </div>
      </Row>

      <Row
        id="pref-events"
        label="Lembrar dos eventos"
        hint="Usa a antecedência escolhida em cada evento (1 dia antes, por padrão)."
        checked={preferences.eventRemindersEnabled}
        disabled={busy}
        onChange={(value) => onSave({ eventRemindersEnabled: value })}
      />

      <Row
        id="pref-digest"
        label="Resumo do dia"
        hint="Um aviso de manhã com o que você tem hoje. Dia sem nada não gera aviso."
        checked={preferences.digestEnabled}
        disabled={busy}
        onChange={(value) => onSave({ digestEnabled: value })}
      >
        <div className="flex flex-col gap-1.5 sm:max-w-56">
          <Label htmlFor="pref-time">Hora do resumo</Label>
          <Input
            id="pref-time"
            type="time"
            value={time}
            disabled={busy || !preferences.digestEnabled}
            onChange={(event) => setTime(event.target.value)}
            onBlur={saveTime}
          />
        </div>
      </Row>

      <Row
        id="pref-email"
        label="Resumo por e-mail"
        hint={
          preferences.digestEnabled
            ? 'Envia o resumo do dia também por e-mail. Desligado por padrão.'
            : 'Ligue o resumo do dia para poder receber por e-mail.'
        }
        checked={preferences.digestEmailEnabled}
        disabled={busy || !preferences.digestEnabled}
        onChange={(value) => onSave({ digestEmailEnabled: value })}
      />

      <Row
        id="pref-report"
        label="Relatório da semana"
        hint="Toda segunda-feira, na hora do resumo, um aviso de que o relatório da semana que passou está pronto."
        checked={preferences.weeklyReportEnabled}
        disabled={busy}
        onChange={(value) => onSave({ weeklyReportEnabled: value })}
      />
    </div>
  );
}

function Row({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-5 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label htmlFor={id}>{label}</Label>
          <p className="text-sm text-muted-foreground">{hint}</p>
        </div>
        <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
      </div>
      {children}
    </div>
  );
}
