import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/contexts/SettingsContext";
import { Link, Trash2 } from "lucide-react";

function isValidAddress(addr: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
}

export function RelationshipEditor() {
  const { userRelationships, addUserRelationship, removeUserRelationship } =
    useSettings();
  const [fromAddress, setFromAddress] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");

  const handleSave = () => {
    const from = fromAddress.trim();
    const to = toAddress.trim();
    const lbl = label.trim();

    if (!from || !to || !lbl) {
      setError("All fields are required");
      return;
    }
    if (!isValidAddress(from)) {
      setError("Invalid 'From' address");
      return;
    }
    if (!isValidAddress(to)) {
      setError("Invalid 'To' address");
      return;
    }

    setError("");
    addUserRelationship({
      id: `${from}-${to}-${lbl}`,
      fromAddress: from,
      toAddress: to,
      label: lbl,
    });

    setFromAddress("");
    setToAddress("");
    setLabel("");
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Link className="size-4 mr-1" />
          Relationships
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>User-Defined Relationships</DialogTitle>
          <DialogDescription>
            Add custom relationships between accounts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            placeholder="From address"
            value={fromAddress}
            onChange={(e) => setFromAddress(e.target.value)}
          />
          <Input
            placeholder="To address"
            value={toAddress}
            onChange={(e) => setToAddress(e.target.value)}
          />
          <Input
            placeholder="Label (e.g. 'owns', 'authority')"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />

          {error && (
            <div className="text-xs text-destructive">{error}</div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={handleSave} size="sm">
            Save Relationship
          </Button>
        </DialogFooter>

        {/* Existing relationships */}
        {userRelationships.length > 0 && (
          <div className="border-t pt-3 space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground">
              Saved Relationships
            </h4>
            {userRelationships.map((rel) => (
              <div
                key={rel.id}
                className="flex items-center justify-between text-xs gap-2"
              >
                <div className="flex-1 truncate font-mono">
                  {rel.fromAddress.slice(0, 4)}...{rel.fromAddress.slice(-4)}
                </div>
                <div className="text-muted-foreground shrink-0">
                  --{rel.label}--&gt;
                </div>
                <div className="flex-1 truncate font-mono text-right">
                  {rel.toAddress.slice(0, 4)}...{rel.toAddress.slice(-4)}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="size-6 p-0 shrink-0"
                  onClick={() => removeUserRelationship(rel.id)}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
