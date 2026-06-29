// Renders the incoming transmission text. The key={text} forces React to
// remount the node whenever the text changes, replaying the fade-in animation.
export default function StoryDisplay({ text }) {
  return (
    <div className="story-display" key={text}>
      <span className="story-prefix">&gt; INCOMING TRANSMISSION //</span>
      <p className="story-text">{text}</p>
    </div>
  )
}
