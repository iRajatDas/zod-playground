import {Badge, Box, Button, Flex, Tooltip, useMantineTheme} from '@mantine/core'
import Editor, {loader} from '@monaco-editor/react'
import {editor} from 'monaco-editor'
import {useEffect, useRef, useState} from 'react'
import {FiAlertCircle} from 'react-icons/fi'
import {ZodSchema, z} from 'zod'
import {generateErrorMessage} from 'zod-error'

import str2 from '../node_modules/zod/lib/types.d.ts?raw'
import {dependencies} from '../package.json'
import classes from './App.module.css'
import {ValueEditor} from './features/ValueEditor/ValueEditor'
import {Value} from './models/value'
import {Header} from './ui/Header/Header'

const ZOD_VERSION = dependencies.zod.split('^')[1]

const editorOptions: editor.IStandaloneEditorConstructionOptions = {
  minimap: {enabled: false},
  theme: 'vs',
  scrollBeyondLastLine: false,
  scrollbar: {
    // Subtle shadows to the left & top. Defaults to true.
    useShadows: false,

    verticalScrollbarSize: 10,
    horizontalScrollbarSize: 10,
  },
  automaticLayout: true,
  formatOnType: true,
  formatOnPaste: true,
}

const libUri = 'file:///node_modules/zod/lib/index.d.ts'

loader.init().then((monaco) => {
  monaco.languages.typescript.typescriptDefaults.addExtraLib(
    `declare namespace z{${str2}}`,
    libUri,
  )
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true,
  })
})

const evaluateExpression = (expression: string) => {
  try {
    const evaluatedExpression = new Function(`return ${expression}`)()
    return {success: true, data: evaluatedExpression} as const
  } catch (e) {
    return {
      success: false,
      error:
        e instanceof SyntaxError
          ? 'Invalid syntax'
          : e instanceof ReferenceError
            ? 'Invalid reference'
            : 'Invalid value',
    } as const
  }
}

const validateData = (schema: ZodSchema, data: unknown) => {
  const validationRes = schema.safeParse(data)
  return validationRes.success
    ? ({success: true, data: validationRes.data} as const)
    : ({
        success: false,
        error: generateErrorMessage(validationRes.error.issues),
      } as const)
}

const schemaSchema = z
  .string()
  .min(2)
  .transform((s, ctx) => {
    try {
      return eval(s)
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Invalid schema'

      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: errorMessage,
        path: ['schema'],
      })
      return z.NEVER
    }
  })
  .pipe(z.custom<ZodSchema>())

const dataSchema = z.object({
  schema: schemaSchema,
  values: z.array(z.string()),
})

const defaultZodScheme = `z.object({
  name: z.string(),
  birth_year: z.number().optional()
})`

const defaultTestValue = '{name: "John"}'

function App() {
  const [values, setValues] = useState<Value[]>([
    {defaultValue: defaultTestValue},
  ])
  const [schemaText, setSchemaText] = useState<string>(defaultZodScheme)
  const [schemaError, setSchemaError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const theme = useMantineTheme()

  useEffect(() => {
    if (schemaText == '') return
    formRef.current?.requestSubmit()
  }, [schemaText])

  return (
    <Box className={classes.layout}>
      <Header />
      <form
        className={classes.form}
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault()

          const formData = new FormData(e.currentTarget)

          try {
            const data = {
              schema: formData.get('schema'),
              values: formData.getAll('value'),
            }

            const {values, schema} = dataSchema.parse(data)
            setSchemaError(null)

            const newValues = values.map((v): Value => {
              const evaluatedExpression = evaluateExpression(v)
              if (!evaluatedExpression.success) {
                return {
                  value: v,
                  validationResult: evaluatedExpression,
                }
              }

              const validationResult = validateData(
                schema,
                evaluatedExpression.data,
              )
              return {
                value: v,
                validationResult,
              } as const
            })
            setValues(newValues)
          } catch (e) {
            if (e instanceof z.ZodError) {
              const schemaIssue = e.issues.find((issue) =>
                issue.path.some((p) => p === 'schema'),
              )
              if (schemaIssue) {
                setSchemaError(schemaIssue.message)
                return
              }
            }
            setSchemaError('Invalid schema')
          }
        }}
        onChange={(e) => {
          const form = e.currentTarget
          form.requestSubmit()
        }}
      >
        <div className={classes.leftPanel}>
          <Flex
            className={classes.sectionTitle}
            align="center"
            justify="space-between"
            bg={schemaError ? theme.colors.red[0] : 'transparent'}
          >
            <Flex gap="sm">
              Zod schema
              <Badge variant="default" size="lg" tt="none">
                v{ZOD_VERSION}
              </Badge>
            </Flex>
            {schemaError && (
              <Tooltip label={schemaError}>
                <Flex align="center">
                  <FiAlertCircle color="red" size="1.5rem" />
                </Flex>
              </Tooltip>
            )}
          </Flex>

          <Editor
            className={classes.editor}
            onChange={(value) => {
              setSchemaText(value ?? '')
            }}
            defaultLanguage="typescript"
            options={editorOptions}
            value={schemaText}
          />
          <input type="hidden" name="schema" value={schemaText} />
        </div>

        <div className={classes.rightPanel}>
          <Flex
            className={classes.sectionTitle}
            align="center"
            justify="space-between"
          >
            Value to be parsed
            <Button
              size="compact-xs"
              onClick={() => {
                setValues((values) => {
                  return [...values, {}]
                })
              }}
            >
              Add a value
            </Button>
          </Flex>

          <div className={classes.valuesStack}>
            {values.map((value, index) => {
              return (
                <ValueEditor
                  key={`val${index}`}
                  value={value}
                  index={index + 1}
                  onChange={() => {
                    formRef.current?.requestSubmit()
                  }}
                />
              )
            })}
          </div>
        </div>
      </form>
    </Box>
  )
}

export default App
