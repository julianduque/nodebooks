import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@nodebooks/client-ui/components/ui";
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
      <TabsList className="w-full overflow-x-auto">
        <TabsTrigger value="outline" className="flex-1 gap-1 px-3 py-1 text-xs">
          <ListTree className="h-4 w-4" /> Outline
        </TabsTrigger>
        {showAttachments ? (
          <TabsTrigger
            value="attachments"
            className="flex-1 gap-1 px-3 py-1 text-xs"
          >
            <Paperclip className="h-4 w-4" /> Attachments
          </TabsTrigger>
        ) : null}
        {showSetup ? (
          <TabsTrigger value="setup" className="flex-1 gap-1 px-3 py-1 text-xs">
            <SettingsIcon className="h-4 w-4" /> Setup
          </TabsTrigger>
        ) : null}
      </TabsList>
    </Tabs>
  );
};

export default NotebookSecondaryHeader;
