import { zodResolver } from '@hookform/resolvers/zod';
import {
  AVATAR_KEYS,
  profileFieldsSchema,
  type ProfileFields,
  type UpdateProfileInput,
  type User,
} from '@lifexp/shared';
import { useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { CharacterCard } from '@/components/game/CharacterCard';
import { EMBLEMS } from '@/components/game/emblems';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '../auth/useAuth';
import { useServerError } from '../auth/useAuthForm';
import { useCharacter } from '../character/useCharacter';
import { listTimezones } from './timezones';

/** Só envia o que mudou: a API aceita atualização parcial e o PATCH fica mínimo. */
function changedFields(values: ProfileFields, user: User): UpdateProfileInput {
  const changes: UpdateProfileInput = {};
  if (values.name !== user.name) changes.name = values.name;
  if (values.timezone !== user.timezone) changes.timezone = values.timezone;
  if (values.avatarKey !== user.avatarKey) changes.avatarKey = values.avatarKey;
  return changes;
}

export function ProfileForm({ user }: { user: User }) {
  const { updateProfile } = useAuth();
  const character = useCharacter();
  const { serverError, run } = useServerError();
  const timezones = useMemo(() => listTimezones(user.timezone), [user.timezone]);

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFields>({
    resolver: zodResolver(profileFieldsSchema),
    defaultValues: { name: user.name, timezone: user.timezone, avatarKey: user.avatarKey },
  });

  const [name, avatarKey] = [watch('name'), watch('avatarKey')];
  const current = watch();
  const hasChanges = Object.keys(changedFields(current, user)).length > 0;

  const onSubmit = handleSubmit((values) =>
    run(async () => {
      const changes = changedFields(values, user);
      if (Object.keys(changes).length === 0) return;
      await updateProfile(changes);
      reset(values);
      toast.success('Perfil atualizado');
    }),
  );

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr]">
      <div className="flex flex-col gap-3">
        <CharacterCard name={name.trim() || user.name} emblem={avatarKey} {...character} />
        <p className="text-sm text-muted-foreground">Prévia: é assim que sua ficha aparece.</p>
      </div>

      <form
        onSubmit={onSubmit}
        noValidate
        className="flex flex-col gap-6 rounded-2xl border border-border bg-card/80 p-6 backdrop-blur sm:p-7"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-name">Nome</Label>
          <Input
            id="profile-name"
            autoComplete="name"
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? 'profile-name-error' : undefined}
            {...register('name')}
          />
          {errors.name && (
            <span id="profile-name-error" className="text-sm text-destructive">
              {errors.name.message}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-email">E-mail</Label>
          <Input id="profile-email" value={user.email} readOnly disabled />
          <p className="text-sm text-muted-foreground">O e-mail não pode ser alterado por aqui.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-timezone">Fuso horário</Label>
          <select
            id="profile-timezone"
            className="h-11 w-full rounded-lg border border-input bg-background/60 px-3 text-sm text-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring/40"
            {...register('timezone')}
          >
            {timezones.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
          <p className="text-sm text-muted-foreground">
            Define em que dia a sua semana começa e termina.
          </p>
          {errors.timezone && (
            <span className="text-sm text-destructive">{errors.timezone.message}</span>
          )}
        </div>

        <fieldset className="flex flex-col gap-2">
          <Label asChild>
            <legend>Emblema</legend>
          </Label>
          <Controller
            control={control}
            name="avatarKey"
            render={({ field }) => (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {AVATAR_KEYS.map((key) => {
                  const { Icon, label } = EMBLEMS[key];
                  return (
                    <label
                      key={key}
                      className="relative grid aspect-square cursor-pointer place-items-center rounded-xl border border-border text-muted-foreground transition hover:text-foreground has-checked:border-xp has-checked:bg-xp/10 has-checked:text-xp has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring"
                    >
                      <input
                        type="radio"
                        name="profile-emblem"
                        value={key}
                        checked={field.value === key}
                        onChange={() => field.onChange(key)}
                        className="sr-only"
                      />
                      <span className="sr-only">{label}</span>
                      <Icon aria-hidden className="size-6" />
                    </label>
                  );
                })}
              </div>
            )}
          />
        </fieldset>

        {serverError && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {serverError}
          </p>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting || !hasChanges}>
            Salvar alterações
          </Button>
        </div>
      </form>
    </div>
  );
}
