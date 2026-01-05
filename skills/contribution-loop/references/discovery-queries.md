# Discovery Queries

GitHub search queries to find repos using design systems.

## Chakra UI
```
"from '@chakra-ui" language:TypeScript stars:>100 pushed:>2024-01-01 -org:chakra-ui
"ChakraProvider" language:TypeScript stars:>50 fork:false pushed:>2024-01-01
```

## Tailwind CSS
```
"tailwind.config" language:JavaScript stars:>100 fork:false pushed:>2024-01-01
"@apply" language:CSS stars:>50 pushed:>2024-01-01
```

## shadcn/ui
```
"components/ui" "shadcn" language:TypeScript stars:>50 pushed:>2024-01-01
"@/components/ui" language:TypeScript stars:>100 fork:false
```

## Radix UI
```
"from '@radix-ui" language:TypeScript stars:>100 pushed:>2024-01-01 -org:radix-ui
"@radix-ui/react" language:TypeScript stars:>50 fork:false
```

## Material UI
```
"from '@mui/material" language:TypeScript stars:>100 pushed:>2024-01-01 -org:mui
"ThemeProvider" "@mui" language:TypeScript stars:>50 fork:false
```

## Ant Design
```
"from 'antd'" language:TypeScript stars:>100 pushed:>2024-01-01 -org:ant-design
"ConfigProvider" "antd" language:TypeScript stars:>50 fork:false
```

## Mantine
```
"from '@mantine" language:TypeScript stars:>50 pushed:>2024-01-01 -org:mantinedev
"MantineProvider" language:TypeScript stars:>50 fork:false
```

## Exclusion Patterns

Exclude these from results:
- The design system library itself (check org)
- Starter templates / boilerplates
- Tutorial repos
- Archived repos
- Forks without significant changes
- Repos with no CONTRIBUTING.md and closed issues

## Prioritization Criteria

Score repos by:
1. **Activity** (commits in last 30 days): +20 points
2. **Stars** (>500): +15 points
3. **CONTRIBUTING.md exists**: +25 points
4. **External PRs accepted**: +30 points
5. **Uses design tokens**: +10 points
6. **Has design system config**: +10 points

Minimum score to proceed: 50 points
