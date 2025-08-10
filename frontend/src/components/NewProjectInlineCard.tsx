// // src/app/_components/NewProjectInlineCard.tsx
// "use client";

// import { useState, memo } from "react";
// import Image from "next/image";
// import { Card } from "@/components/ui/card";
// import { Button } from "@/components/ui/button";
// import { Badge } from "@/components/ui/badge";
// import {
//   iconForProjectType,
//   placeholderForType,
//   type ProjectKind,
// } from "@/lib/project-utils";

// type Props = {
//   onSave: (values: {
//     title: string;
//     description?: string | null;
//     type: string; // keep API flexible
//   }) => void;
//   onCancel: () => void;
// };

// // Available types
// const TYPE_OPTIONS: { key: ProjectKind; label: string }[] = [
//   { key: "book", label: "Book" },
//   { key: "branding", label: "Branding" },
//   { key: "fashion", label: "Fashion" },
//   { key: "game", label: "Game" },
//   { key: "music", label: "Music" },
//   { key: "podcast", label: "Podcast" },
//   { key: "video", label: "Video" },
// ];

// export const NewProjectInlineCard = memo(function NewProjectInlineCard({
//   onSave,
//   onCancel,
// }: Props) {
//   const [title, setTitle] = useState("");
//   const [desc, setDesc] = useState("");
//   const [type, setType] = useState<ProjectKind>("book");

//   const TypeIcon = iconForProjectType(type);
//   const previewSrc = placeholderForType(type);

//   return (
//     <Card className="w-full transition-transform duration-200 ease-in-out transform hover:scale-[1.02] overflow-hidden ring-2 ring-primary/20 py-0 max-w-5xl mx-auto">
//       {/* Swap layout at 625px just like ProjectCard */}
//       <div className="@container">
//         <div className="flex flex-col w-full @[700px]:flex-row">
//           {/* Image */}
//           <div className="relative bg-muted shrink-0 w-full h-48 @[700px]:w-44 @[700px]:h-60">
//             <Image
//               src={previewSrc}
//               alt="New project placeholder"
//               width={480}
//               height={480}
//               className="h-full w-full object-cover"
//               priority={false}
//             />
//           </div>

//           {/* Right/below form content */}
//           <div className="flex-1 p-2">
//             <div className="mt-2 flex flex-wrap gap-2">
//               {TYPE_OPTIONS.map((opt) => {
//                 const SelectedIcon = iconForProjectType(opt.key);
//                 const selected = type === opt.key;
//                 return (
//                   <button
//                     key={opt.key}
//                     type="button"
//                     onClick={() => setType(opt.key)}
//                     className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs ${
//                       selected
//                         ? "ring-2 ring-offset-1 ring-primary border-transparent"
//                         : "hover:bg-muted"
//                     }`}
//                   >
//                     <SelectedIcon className="h-4 w-4" />
//                     {opt.label}
//                   </button>
//                 );
//               })}
//             </div>
//             <div className="flex flex-col justify-between min-h-32">
//               {/* Title + description */}
//               <div className="mt-2 space-y-1.5">
//                 <input
//                   className="h-10 w-full rounded-md border bg-background px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-primary"
//                   placeholder="Project title"
//                   value={title}
//                   onChange={(e) => setTitle(e.target.value)}
//                 />
//                 <input
//                   className="h-10 lg:h-20 w-full resize-none rounded-md border bg-background px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-primary"
//                   placeholder="Short description (optional)"
//                   value={desc}
//                   onChange={(e) => setDesc(e.target.value)}
//                 />
//               </div>

//               {/* Actions */}
//               <div className="mt-2 flex gap-2">
//                 <Button
//                   onClick={() =>
//                     onSave({
//                       title: title.trim(),
//                       description: desc.trim() || null,
//                       type, // pass selected type
//                     })
//                   }
//                   disabled={!title.trim()}
//                 >
//                   Save
//                 </Button>
//                 <Button variant="secondary" onClick={onCancel}>
//                   Cancel
//                 </Button>
//               </div>
//             </div>
//           </div>
//         </div>
//       </div>
//     </Card>
//   );
// });

// src/app/_components/NewProjectInlineCard.tsx
"use client";

import { useState, memo } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  iconForProjectType,
  placeholderForType,
  type ProjectKind,
} from "@/lib/project-utils";

type Props = {
  onSave: (values: {
    title: string;
    description?: string | null;
    type: string;
  }) => Promise<void> | void;
  onCancel: () => void;
};

const TYPE_OPTIONS: { key: ProjectKind; label: string }[] = [
  { key: "book", label: "Book" },
  { key: "branding", label: "Branding" },
  { key: "fashion", label: "Fashion" },
  { key: "game", label: "Game" },
  { key: "music", label: "Music" },
  { key: "podcast", label: "Podcast" },
  { key: "video", label: "Video" },
];

export const NewProjectInlineCard = memo(function NewProjectInlineCard({
  onSave,
  onCancel,
}: Props) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [type, setType] = useState<ProjectKind>("book");
  const [busy, setBusy] = useState(false);

  const TypeIcon = iconForProjectType(type);
  const previewSrc = placeholderForType(type);

  const handleSave = async () => {
    try {
      setBusy(true);
      await onSave({
        title: title.trim(),
        description: desc.trim() || null,
        type,
      });
      toast.success("Project created");
      setTitle("");
      setDesc("");
    } catch (e) {
      toast.error("Failed to create project");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="w-full transition-transform duration-200 ease-in-out transform hover:scale-[1.02] overflow-hidden ring-2 ring-primary/20 py-0 max-w-5xl mx-auto">
      <div className="@container">
        <div className="flex w-full flex-col @[700px]:flex-row md:min-h-64 lg:min-h-52">
          <div className="relative bg-muted shrink-0 w-full h-48 @[700px]:w-44 @[700px]:h-60">
            <Image
              src={previewSrc}
              alt="New project placeholder"
              width={480}
              height={480}
              className="h-full w-full object-cover"
            />
          </div>

          <div className="flex-1 p-2">
            <div className="flex items-center justify-between">
              <span className="font-medium flex items-center gap-2">
                <TypeIcon className="h-4 w-4" />
                Create a new project
              </span>
              <Badge variant="outline">Draft</Badge>
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              {TYPE_OPTIONS.map((opt) => {
                const SelectedIcon = iconForProjectType(opt.key);
                const selected = type === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setType(opt.key)}
                    className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs ${selected ? "ring-2 ring-offset-1 ring-primary border-transparent" : "hover:bg-muted"}`}
                  >
                    <SelectedIcon className="h-4 w-4" />
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-2 space-y-1.5">
              <input
                className="h-10 w-full rounded-md border bg-background px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-primary"
                placeholder="Project title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <textarea
                className="h-28 lg:h-20 w-full resize-none rounded-md border bg-background px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-primary"
                placeholder="Short description (optional)"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
              />
            </div>

            <div className="mt-2 flex gap-2">
              <Button onClick={handleSave} disabled={!title.trim() || busy}>
                Save
              </Button>
              <Button variant="secondary" onClick={onCancel} disabled={busy}>
                Cancel
              </Button>
            </div>

            <div className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">
              * Placeholder image updates when you change the type.
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
});
