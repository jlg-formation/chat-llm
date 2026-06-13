import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { LeftSidebar } from './components/LeftSidebar'
import { Chat } from './components/Chat'
import { RightSidebar } from './components/RightSidebar'

export default function App() {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Header />
      <div className="flex flex-1 min-h-0">
        <LeftSidebar />
        <Chat />
        <RightSidebar />
      </div>
      <Footer />
    </div>
  )
}
