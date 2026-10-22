// Coquille de l'application. La page de réponse par lien public est rendue seule : ni en-tête de la suite,
// ni requête qui demanderait une session (la personne qui répond n'a pas de compte).

import { Header } from './components/Header.tsx'
import { AppProvider, useApp } from './components/AppContext.tsx'
import { UiProvider } from './components/ui.tsx'
import { useRoute, type Route } from './lib/router.ts'
import { FormPage } from './views/FormPage.tsx'
import { DeletedView, FillView, HomeView, PreviewView, PublicView } from './views/OtherViews.tsx'

function View({ route }: { route: Route }) {
  switch (route.name) {
    case 'home':
      return <HomeView />
    case 'deleted':
      return <DeletedView />
    case 'form':
      return <FormPage id={route.id} tab={route.tab} />
    default:
      return (
        <div className="column card">
          Cette adresse ne mène à aucun formulaire. <a href="/">Revenir à la liste</a>
        </div>
      )
  }
}

function Shell() {
  const route = useRoute()
  const { user } = useApp()
  const bare = route.name === 'preview' || route.name === 'fill'
  return (
    <div className="shell">
      <a className="sr-only" href="#contenu">
        Aller au contenu
      </a>
      <Header user={user} />
      <main id="contenu" className={bare ? undefined : 'main--wide'}>
        {route.name === 'preview' ? <PreviewView id={route.id} /> : route.name === 'fill' ? <FillView id={route.id} /> : <View route={route} />}
      </main>
    </div>
  )
}

export function App() {
  const route = useRoute()
  if (route.name === 'public') {
    return (
      <UiProvider>
        <main id="contenu">
          <PublicView token={route.token} />
        </main>
      </UiProvider>
    )
  }
  return (
    <UiProvider>
      <AppProvider>
        <Shell />
      </AppProvider>
    </UiProvider>
  )
}
