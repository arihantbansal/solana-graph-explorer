import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSettings } from "@/contexts/SettingsContext";
import { Link, Trash2, ArrowRight, ChevronDown, ChevronRight } from "lucide-react";
import type { PdaRelationshipRule } from "@/types/relationships";

export function RelationshipEditor() {
  const { relationshipRules, removeRelationshipRule } = useSettings();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Link className="size-4 mr-1" />
          Rules
          {relationshipRules.length > 0 && (
            <Badge variant="secondary" className="ml-1 text-[9px] px-1">
              {relationshipRules.length}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>PDA Relationship Rules</DialogTitle>
          <DialogDescription>
            Saved rules auto-derive PDA accounts when matching source accounts
            appear on the graph. Create rules from the "Derive PDA..." button on
            any decoded account.
          </DialogDescription>
        </DialogHeader>

        {relationshipRules.length === 0 ? (
          <div className="text-xs text-muted-foreground py-4 text-center">
            No rules saved yet. Explore an account, then use "Derive PDA..." to
            create one.
          </div>
        ) : (
          <div className="space-y-2">
            {relationshipRules.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                onRemove={removeRelationshipRule}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RuleRow({
  rule,
  onRemove,
}: {
  rule: PdaRelationshipRule;
  onRemove: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border rounded p-2 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
        >
          {expanded ? (
            <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
          )}
          <Badge variant="secondary" className="text-[9px] px-1 shrink-0">
            {rule.sourceAccountType}
          </Badge>
          <ArrowRight className="size-3 text-muted-foreground shrink-0" />
          <span className="text-xs font-mono truncate">
            {rule.targetPdaName}
          </span>
          <span className="text-amber-500 text-xs shrink-0">
            ({rule.label})
          </span>
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="size-6 p-0 shrink-0"
          onClick={() => onRemove(rule.id)}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>

      {expanded && (
        <div className="ml-5 space-y-1 text-[10px] text-muted-foreground">
          <div>
            Target program:{" "}
            <span className="font-mono">
              {rule.targetProgramId.slice(0, 16)}...
            </span>
          </div>
          <div className="font-medium">Seeds:</div>
          {rule.seedMappings.map((m, i) => (
            <div key={i} className="flex items-center gap-1 ml-2">
              <Badge variant="outline" className="text-[8px] px-0.5">
                {m.seed.kind}
              </Badge>
              <span>→</span>
              <SeedSourceLabel source={m.source} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SeedSourceLabel({ source }: { source: PdaRelationshipRule["seedMappings"][0]["source"] }) {
  switch (source.kind) {
    case "idl_const":
      return <span className="italic">IDL constant</span>;
    case "field":
      return (
        <span>
          field <span className="font-mono">{source.fieldName}</span>
        </span>
      );
    case "source_address":
      return <span className="italic">source address</span>;
    case "const":
      return (
        <span>
          &ldquo;{source.value}&rdquo; ({source.encoding})
        </span>
      );
  }
}
