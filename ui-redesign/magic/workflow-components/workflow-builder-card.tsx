// Source: Magic MCP Server - 21st_magic_component_inspiration
// Component: Workflow Builder Card
// Search Query: "workflow DAG graph nodes"

import { motion, AnimatePresence } from "framer-motion";
import { MoreHorizontal } from "lucide-react";
import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Define the types for the component props for type-safety and reusability
interface User {
  src: string;
  fallback: string;
}

interface Action {
  Icon: React.ElementType;
  bgColor: string;
}

interface WorkflowBuilderCardProps {
  imageUrl: string;
  status: "Active" | "Inactive";
  lastUpdated: string;
  title: string;
  description: string;
  tags: string[];
  users: User[];
  actions: Action[];
  className?: string;
}

export const WorkflowBuilderCard = ({
  imageUrl,
  status,
  lastUpdated,
  title,
  description,
  tags,
  users,
  actions,
  className,
}: WorkflowBuilderCardProps) => {
  const [isHovered, setIsHovered] = React.useState(false);

  // Animation variants for the details section
  const detailVariants = {
    hidden: { opacity: 0, height: 0, marginTop: 0 },
    visible: {
      opacity: 1,
      height: "auto",
      marginTop: "1rem",
      transition: { duration: 0.3, ease: "easeInOut" },
    },
  };

  return (
    <motion.div
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      whileHover={{ y: -6 }}
      transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
      className={cn("w-full max-w-sm cursor-pointer", className)}
    >
      <Card className="overflow-hidden rounded-xl shadow-md transition-shadow duration-300 hover:shadow-xl">
        {/* Card Image */}
        <div className="relative h-36 w-full">
          <img src={imageUrl} alt={title} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
        </div>

        <div className="p-4">
          {/* Always-visible header content */}
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{lastUpdated}</span>
                <span>•</span>
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      status === "Active" ? "bg-green-500" : "bg-red-500",
                    )}
                    aria-label={status}
                  />
                  <span>{status}</span>
                </div>
              </div>
              <h3 className="mt-1 text-lg font-semibold text-card-foreground">{title}</h3>
            </div>
            <button
              aria-label="More options"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <MoreHorizontal size={20} />
            </button>
          </div>

          {/* Animated description and tags section */}
          <AnimatePresence>
            {isHovered && (
              <motion.div
                key="details"
                initial="hidden"
                animate="visible"
                exit="hidden"
                variants={detailVariants}
                className="overflow-hidden"
              >
                <p className="text-sm text-muted-foreground">{description}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Card Footer */}
        <div className="flex items-center justify-between border-t border-border p-4">
          <div className="flex -space-x-2">
            {users.map((user, index) => (
              <Avatar
                key={index}
                className="h-7 w-7 border-2 border-card"
                aria-label={user.fallback}
              >
                <AvatarImage src={user.src} />
                <AvatarFallback>{user.fallback}</AvatarFallback>
              </Avatar>
            ))}
          </div>
          <div className="flex items-center -space-x-2">
            {actions.map(({ Icon, bgColor }, index) => (
              <div
                key={index}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border-2 border-card text-white",
                  bgColor,
                )}
              >
                <Icon size={14} />
              </div>
            ))}
          </div>
        </div>
      </Card>
    </motion.div>
  );
};

// Demo component
import { Code, Share2, Zap } from "lucide-react";

export function WorkflowBuilderCardDemo() {
  const cardData = {
    imageUrl:
      "https://images.unsplash.com/photo-1752154344437-44bd7480e8ee?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHx0b3BpYy1mZWVkfDY1fENEd3V3WEpBYkV3fHxlbnwwfHx8fHw%3D&auto=format&fit=crop&q=60&w=900?q=80&w=2940&auto=format&fit=crop",
    status: "Active" as const,
    lastUpdated: "5 days ago",
    title: "Personal Email Assistant",
    description: "Your AI helper for reading, organizing, and responding to emails.",
    tags: ["Personal", "Marketing"],
    users: [
      { src: "https://i.pravatar.cc/150?img=1", fallback: "U1" },
      { src: "https://i.pravatar.cc/150?img=2", fallback: "U2" },
      { src: "https://i.pravatar.cc/150?img=3", fallback: "U3" },
      { src: "https://i.pravatar.cc/150?img=4", fallback: "+3" },
    ],
    actions: [
      { Icon: Zap, bgColor: "bg-blue-500" },
      { Icon: Code, bgColor: "bg-gray-700" },
      { Icon: Share2, bgColor: "bg-red-500" },
    ],
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background p-4">
      <WorkflowBuilderCard {...cardData} />
    </div>
  );
}
