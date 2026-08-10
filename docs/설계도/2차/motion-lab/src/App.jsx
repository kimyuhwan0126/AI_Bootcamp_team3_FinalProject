import { useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import "./App.css"

function App() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <main className="app">
      <h1>나의 첫 Motion 화면</h1>

      <motion.button
        className="open-button"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? "카드 닫기" : "카드 열기"}
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.section
            className="card"
            initial={{
              opacity: 0,
              y: 40,
              scale: 0.9,
            }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
            }}
            exit={{
              opacity: 0,
              y: 20,
              scale: 0.95,
            }}
            transition={{
              type: "spring",
              stiffness: 280,
              damping: 22,
            }}
          >
            <h2>움직이는 카드</h2>
            <p>버튼을 누르면 카드가 나타나고 사라집니다.</p>
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  )
}

export default App
