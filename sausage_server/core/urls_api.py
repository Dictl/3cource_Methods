from django.urls import path
from . import api_views

urlpatterns = [
    path('tree/', api_views.api_tree, name='api_tree'),
    path('category/move/', api_views.api_move_category, name='api_move_category'),
]