import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ListTree, Paperclip, Settings as SettingsIcon } from "lucide-react";

export interface NotebookSecondaryHeaderProps {
  value: "outline" | "attachments" | "setup";
  onChange(value: "outline" | "attachments" | "setup"): void;
  showAttachments?: boolean;
  showSetup?: boolean;
}

const NotebookSecondaryHeader = ({
  value,
  onChange,
  showAttachments = true,
  showSetup = true,
}: NotebookSecondaryHeaderProps) => {
  return (
    <Tabs
      value={value}
      onValueChange={(next) =>
        onChange(next as "outline" | "attachments" | "setup")
      }
    >
      <TabsList className="h-8">
        <TabsTrigger value="outline" className="gap-1 px-2 py-1 text-xs">
          <ListTree className="h-4 w-4" /> Outline
        </TabsTrigger>
        {showAttachments ? (
          <TabsTrigger value="attachments" className="gap-1 px-2 py-1 text-xs">
            <Paperclip className="h-4 w-4" /> Attachments
          </TabsTrigger>
        ) : null}
        {showSetup ? (
          <TabsTrigger value="setup" className="gap-1 px-2 py-1 text-xs">
            <SettingsIcon className="h-4 w-4" /> Setup
          </TabsTrigger>
        ) : null}
      </TabsList>
    </Tabs>
  );
};

export default NotebookSecondaryHeader;
