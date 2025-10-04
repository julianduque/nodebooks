import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ListTree, Paperclip, Settings as SettingsIcon } from "lucide-react";

type SidebarView = "outline" | "attachments" | "setup";

export interface NotebookSecondaryHeaderProps {
  value: SidebarView;
  onChange(value: SidebarView): void;
}

const NotebookSecondaryHeader = ({
  value,
  onChange,
}: NotebookSecondaryHeaderProps) => {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as SidebarView)}>
      <TabsList className="h-8">
        <TabsTrigger value="outline" className="gap-1 px-2 py-1 text-xs">
          <ListTree className="h-4 w-4" /> Outline
        </TabsTrigger>
        <TabsTrigger value="attachments" className="gap-1 px-2 py-1 text-xs">
          <Paperclip className="h-4 w-4" /> Attachments
        </TabsTrigger>
        <TabsTrigger value="setup" className="gap-1 px-2 py-1 text-xs">
          <SettingsIcon className="h-4 w-4" /> Setup
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
};

export default NotebookSecondaryHeader;
