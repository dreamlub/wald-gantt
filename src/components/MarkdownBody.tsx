interface Props {
  text: string
  className?: string
  boldClassName?: string
}

export function MarkdownBody({ text, className, boldClassName = 'font-semibold text-foreground' }: Props) {
  const lines = text.split('\n')
  return (
    <div className={className}>
      {lines.map((line, i) => {
        const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
          part.startsWith('**') && part.endsWith('**')
            ? <strong key={j} className={boldClassName}>{part.slice(2, -2)}</strong>
            : <span key={j}>{part.replace(/\*/g, '')}</span>
        )
        return <div key={i}>{parts}</div>
      })}
    </div>
  )
}
