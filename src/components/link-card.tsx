import type { Link as LinkType } from '@/lib/db/schema';
import { Card, CardContent } from '@/components/ui/card';
import { ExternalLink } from 'lucide-react';

interface LinkCardProps {
  link: LinkType;
}

export function LinkCard({ link }: LinkCardProps) {
  const domain = new URL(link.url).hostname.replace('www.', '');

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block"
    >
      <Card className="h-full overflow-hidden transition-colors hover:bg-muted/50 flex flex-col">
        {link.image ? (
          <div className="aspect-video w-full overflow-hidden">
            <img
              src={link.image}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <div className="bg-muted flex aspect-video w-full items-center justify-center">
            <ExternalLink className="text-muted-foreground h-8 w-8" />
          </div>
        )}
        <CardContent className="flex flex-1 flex-col p-3">
          <h3 className="line-clamp-2 font-medium leading-tight">
            {link.title || domain}
          </h3>
          <p className="text-muted-foreground mt-1 line-clamp-2 flex-1 text-sm">
            {link.description || ''}
          </p>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            {link.favicon && (
              <img src={link.favicon} alt="" className="h-4 w-4" />
            )}
            <span>{domain}</span>
          </div>
        </CardContent>
      </Card>
    </a>
  );
}
