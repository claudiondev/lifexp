import type { Task } from '@lifexp/shared';
import { useAreas } from '../areas/useAreas';
import { TaskCard } from './TaskCard';
import type { TaskActions } from './useTaskActions';

/** A lista de cartões; resolve a área de cada tarefa. A ordem já vem do servidor. */
export function TaskList({
  tasks,
  actions,
  onEdit,
  today,
}: {
  tasks: Task[];
  actions: TaskActions;
  onEdit: (task: Task) => void;
  today: string;
}) {
  const areas = useAreas(true);
  const byId = new Map((areas.data ?? []).map((area) => [area.id, area]));
  return (
    <ul className="flex flex-col gap-3">
      {tasks.map((task) => {
        const area = task.areaId ? byId.get(task.areaId) : undefined;
        return (
          <li key={task.id}>
            <TaskCard
              task={task}
              area={area ? { name: area.name, color: area.color } : undefined}
              actions={actions}
              onEdit={onEdit}
              today={today}
            />
          </li>
        );
      })}
    </ul>
  );
}
