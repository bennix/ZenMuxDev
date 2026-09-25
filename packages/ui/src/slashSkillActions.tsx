/**
 * `/` 技能列表上的添加和删除。列表直接读技能目录，不依赖会话里冻结的引用快照。
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { SkillSummary } from "@zcode/shared";
import { Button } from "@/components/ui/button.js";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.js";
import { Input } from "@/components/ui/input.js";
import { useConfirmDialog } from "@/hooks/useConfirmDialog.js";
import { useWorkspaceServicesResolution } from "@/hooks/useWorkspaceServices.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { PromptInputSuggestionItem } from "@/lib/promptInputTriggers.js";
import { logger } from "@/logger.js";
import { refreshSharedSkillStoreForWorkspace } from "@/lib/skillStoreRefresh.js";

export function useSlashSkillActions(params: {
  workspacePath: string;
  workspaceIdentity?: string;
  enabled: boolean;
}): {
  skills: SkillSummary[] | null;
  loading: boolean;
  error: string | null;
  footer: ReactNode;
  dialog: ReactNode;
  deleteSkill: (suggestion: PromptInputSuggestionItem) => void;
} {
  const { intl } = useZCodeIntl();
  const confirmDialog = useConfirmDialog();
  const resolution = useWorkspaceServicesResolution(params.workspacePath, null, params.workspaceIdentity);
  const [skills, setSkills] = useState<SkillSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.enabled || !params.workspacePath || !resolution.rpcReady) return;
    let cancelled = false;
    setLoading(true);
    void resolution.services.skillsService
      .list({
        workspacePath: params.workspacePath,
        ...(params.workspaceIdentity ? { workspaceIdentity: params.workspaceIdentity } : {}),
      })
      .then((result) => {
        if (cancelled) return;
        setSkills(result.skills);
        setError(null);
      })
      .catch((listError: unknown) => {
        if (cancelled) return;
        const message = listError instanceof Error ? listError.message : String(listError);
        logger.warn("[slash-skills] 读取技能失败", { error: message });
        setError(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    params.enabled,
    params.workspaceIdentity,
    params.workspacePath,
    resolution.rpcReady,
    resolution.services.skillsService,
    revision,
  ]);

  const reload = useCallback(async () => {
    await refreshSharedSkillStoreForWorkspace({
      workspacePath: params.workspacePath,
      workspaceIdentity: params.workspaceIdentity,
      skillsService: resolution.services.skillsService,
    });
    setRevision((current) => current + 1);
  }, [params.workspaceIdentity, params.workspacePath, resolution.services.skillsService]);

  const deleteSkill = useCallback(
    (suggestion: PromptInputSuggestionItem) => {
      const skillId = suggestion.id.startsWith("skill:") ? suggestion.id.slice("skill:".length) : "";
      if (!skillId || suggestion.data?.scope === "plugin") return;
      void (async () => {
        const confirmed = await confirmDialog({
          title: intl.formatMessage({ id: "settings.skills.delete.title" }),
          description: intl.formatMessage(
            { id: "settings.skills.delete.description" },
            { name: suggestion.value },
          ),
          confirmLabel: intl.formatMessage({ id: "common.delete" }),
        });
        if (!confirmed) return;
        try {
          await resolution.services.skillsService.deleteSkill({
            workspacePath: params.workspacePath,
            ...(params.workspaceIdentity ? { workspaceIdentity: params.workspaceIdentity } : {}),
            skillId,
          });
          await reload();
        } catch (deleteError) {
          logger.error("[slash-skills] 删除技能失败", { error: deleteError });
          setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
        }
      })();
    },
    [
      confirmDialog,
      intl,
      params.workspaceIdentity,
      params.workspacePath,
      reload,
      resolution.services.skillsService,
    ],
  );

  const save = async () => {
    setSaving(true);
    setFormError(null);
    try {
      await resolution.services.skillsService.createSkill({
        workspacePath: params.workspacePath,
        ...(params.workspaceIdentity ? { workspaceIdentity: params.workspaceIdentity } : {}),
        name,
        description,
        body,
      });
      setOpen(false);
      setName("");
      setDescription("");
      setBody("");
      await reload();
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  const footer = (
    <div className="border-t border-border px-3 py-2">
      <Button
        type="button"
        variant="ghost"
        className="h-7 px-2 text-ui-caption"
        onMouseDown={(event) => {
          event.preventDefault();
          setOpen(true);
        }}
      >
        {intl.formatMessage({ id: "chat.slash.skills.add" })}
      </Button>
    </div>
  );

  const dialog = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{intl.formatMessage({ id: "chat.slash.skills.dialogTitle" })}</DialogTitle>
        </DialogHeader>
        <label className="mt-3 block text-ui-caption">
          {intl.formatMessage({ id: "chat.slash.skills.name" })}
          <Input
            value={name}
            placeholder={intl.formatMessage({ id: "chat.slash.skills.nameHint" })}
            onChange={(event) => setName(event.target.value)}
            className="mt-1"
          />
        </label>
        <label className="mt-3 block text-ui-caption">
          {intl.formatMessage({ id: "chat.slash.skills.description" })}
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="mt-1 min-h-16 w-full rounded-lg border border-border bg-background p-2 text-ui-base"
          />
        </label>
        <label className="mt-3 block text-ui-caption">
          {intl.formatMessage({ id: "chat.slash.skills.body" })}
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="mt-1 min-h-24 w-full rounded-lg border border-border bg-background p-2 text-ui-base"
          />
        </label>
        {formError ? <p className="mt-2 text-ui-caption text-warning">{formError}</p> : null}
        <div className="mt-3 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {intl.formatMessage({ id: "common.cancel" })}
          </Button>
          <Button type="button" disabled={saving || !name.trim() || !description.trim()} onClick={() => void save()}>
            {intl.formatMessage({ id: "common.save" })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return { skills, loading, error, footer, dialog, deleteSkill };
}
