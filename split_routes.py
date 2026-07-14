import os
import re

routes = [
    "src/routes/admin.analytics.tsx",
    "src/routes/admin.documents.tsx",
    "src/routes/admin.scanner.tsx",
    "src/routes/admin.students.tsx",
    "src/routes/admin.dashboard.tsx",
    "src/routes/scan.$token.tsx",
]

for route in routes:
    if not os.path.exists(route): continue
    
    with open(route, 'r') as f:
        content = f.read()
        
    # Find head block if exists
    head_match = re.search(r'head:\s*\(\)\s*=>\s*\(\{(.*?)\}\)', content, re.DOTALL)
    head_str = f"head: () => ({{{head_match.group(1)}}})," if head_match else ""
    
    # We will rename the original file to .lazy.tsx
    lazy_route = route.replace('.tsx', '.lazy.tsx')
    
    # Replace createFileRoute with createLazyFileRoute in the lazy file
    lazy_content = content.replace('createFileRoute(', 'createLazyFileRoute(')
    lazy_content = lazy_content.replace('import { createFileRoute', 'import { createLazyFileRoute')
    
    # Write lazy route
    with open(lazy_route, 'w') as f:
        f.write(lazy_content)
        
    # Write the new eager route (without component)
    route_name = route.replace("src/routes/", "").replace(".tsx", "")
    
    eager_content = f"""import {{ createFileRoute }} from "@tanstack/react-router";

export const Route = createFileRoute("/{route_name}")({{
  {head_str}
}});
"""
    with open(route, 'w') as f:
        f.write(eager_content)

print("Split routes successfully!")
