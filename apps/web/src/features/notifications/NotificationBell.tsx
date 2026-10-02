import type { AppNotification } from '@lifexp/shared';
import { Bell, BellOff, CheckCheck } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useNow } from '@/features/blocks/useNow';
import { cn } from '@/lib/utils';
import { badgeText, notificationTarget, relativeTime } from './notificationFormat';
import { useNotificationList, useNotificationMutations, useUnreadCount } from './useNotifications';

/** Sino do HUD: selo com as não lidas e, ao abrir, a central de avisos (RF38). */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const unread = useUnreadCount();
  const count = unread.data ?? 0;
  const badge = badgeText(count);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        aria-label={count > 0 ? `Notificações, ${count} não lidas` : 'Notificações'}
        onClick={() => setOpen(true)}
      >
        <Bell aria-hidden className="size-4" />
        {badge && (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-xp px-1 font-hud text-[0.6rem] font-bold text-background tabular-nums"
          >
            {badge}
          </span>
        )}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          {/* Desmontado ao fechar: a lista só é buscada com o painel aberto. */}
          {open && <NotificationCenter unreadCount={count} onClose={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function NotificationCenter({
  unreadCount,
  onClose,
}: {
  unreadCount: number;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const now = useNow().toJSDate();
  const list = useNotificationList(true);
  const { markRead, markAllRead } = useNotificationMutations();
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];

  const open = (notification: AppNotification) => {
    if (notification.readAt === null) markRead.mutate(notification.id);
    onClose();
    void navigate(notificationTarget(notification));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="pr-8">
        <DialogTitle>Notificações</DialogTitle>
        <DialogDescription>Lembretes de blocos e eventos, e o resumo do seu dia.</DialogDescription>
      </div>

      {unreadCount > 0 && (
        <Button
          variant="secondary"
          size="sm"
          className="self-start"
          disabled={markAllRead.isPending}
          onClick={() => markAllRead.mutate()}
        >
          <CheckCheck aria-hidden className="size-4" />
          Marcar todas como lidas
        </Button>
      )}

      {list.isPending && (
        <div
          aria-busy="true"
          className="h-24 animate-pulse rounded-xl border border-border bg-background/40"
        />
      )}

      {list.isError && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">Não foi possível carregar as notificações.</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={() => void list.refetch()}
          >
            Tentar de novo
          </Button>
        </div>
      )}

      {list.isSuccess && items.length === 0 && (
        <p className="flex items-center gap-3 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
          <BellOff aria-hidden className="size-5 shrink-0" />
          Nada por aqui ainda. Os lembretes aparecem pouco antes dos seus blocos e eventos.
        </p>
      )}

      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((notification) => {
            const unreadItem = notification.readAt === null;
            return (
              <li key={notification.id}>
                <button
                  type="button"
                  onClick={() => open(notification)}
                  className={cn(
                    'flex w-full flex-col gap-0.5 rounded-xl border p-3 text-left transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                    unreadItem ? 'border-xp/40 bg-xp/5' : 'border-border bg-background/40',
                  )}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className={cn('text-sm', unreadItem ? 'font-semibold' : 'font-medium')}>
                      {unreadItem && <span className="sr-only">Não lida: </span>}
                      {notification.title}
                    </span>
                    <span className="shrink-0 font-hud text-[0.65rem] text-muted-foreground">
                      {relativeTime(notification.createdAt, now)}
                    </span>
                  </span>
                  <span className="text-sm text-muted-foreground">{notification.body}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {list.hasNextPage && (
        <Button
          variant="ghost"
          size="sm"
          className="self-center"
          disabled={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          Carregar mais
        </Button>
      )}
    </div>
  );
}
